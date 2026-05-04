import cv2
import face_recognition
import numpy as np
import time, glob
from datetime import datetime
import os
import base64
from firebase_config import initialize_firebase
import serial

# --- QR Code Support ---
try:
    from pyzbar import pyzbar
    QR_ENABLED = True
    print("[INFO] ✅ QR Code scanner aktif (pyzbar ditemukan).")
except ImportError:
    QR_ENABLED = False
    print("[WARNING] ⚠️  pyzbar tidak ditemukan. QR Code scanner dinonaktifkan.")
    print("[WARNING]    Install dengan: pip install pyzbar")

# --- KONFIGURASI ARDUINO ---
ARDUINO_PORT = 'COM15'
BAUD_RATE = 9600

print(f"[INFO] Mencoba terhubung ke Arduino di {ARDUINO_PORT}...")
try:
    arduino = serial.Serial(ARDUINO_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)
    print("[SUCCESS] Terhubung ke Arduino Mega!")
except Exception as e:
    print(f"[ERROR] Gagal terhubung ke Arduino. Detail: {e}")
    arduino = None

# --- KONFIGURASI ---
HOLD_TIME = 2.0
TOLERANCE = 0.4

# 1. Inisialisasi Firebase
db_conn = initialize_firebase()
ref_logs     = db_conn.reference('logs')
ref_queue    = db_conn.reference('registration_queue')
ref_commands = db_conn.reference('door_commands')
ref_health   = db_conn.reference('system_health')
ref_tokens   = db_conn.reference('guest_tokens')   # ← NODE BARU untuk QR pass

known_face_encodings = []
known_face_names = []
pending_registrations = []
buka_pintu_dari_web = False

# ===============================================
# ARDUINO : HANDLE PORT YANG BERPINDAH PADA RASPI
# ===============================================
def hubungkan_arduino_otomatis():
    print("[INFO] Mencari koneksi Arduino yang aktif...")
    # Cari semua port USB yang tersedia (ttyUSB0, ttyUSB1, dst)
    daftar_port = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*')
    
    for port in daftar_port:
        try:
            # Mencoba menyambung ke port
            koneksi = serial.Serial(port, 9600, timeout=1)
            print(f"[SUCCESS] Arduino terhubung kembali di jalur {port}!")
            time.sleep(2) # Beri waktu Arduino untuk bernapas setelah tersambung
            return koneksi
        except (OSError, serial.SerialException):
            pass
            
    print("[ERROR] Arduino tidak ditemukan sama sekali.")
    return None

# Cara memanggilnya saat program pertama kali berjalan:
# arduino = hubungkan_arduino_otomatis()

# ==========================================
# LISTENER: REGISTRASI WAJAH BARU
# ==========================================
def proses_data_wajah(key, val):
    if isinstance(val, dict) and 'name' in val and 'image_base64' in val:
        pending_registrations.append((key, val['name'], val['image_base64']))
        print(f"\n[CLOUD] 📥 Pesanan wajah baru diterima ({val['name']}). Menunggu diproses...")

def handle_new_registration(event):
    if event.data is None:
        return
    if event.path == '/':
        if isinstance(event.data, dict):
            for key, val in event.data.items():
                proses_data_wajah(key, val)
    else:
        proses_data_wajah(event.path.replace('/', ''), event.data)

# ==========================================
# LISTENER: PERINTAH BUKA PINTU DARI WEB
# ==========================================
def handle_door_commands(event):
    global buka_pintu_dari_web
    if event.data is None:
        return

    def proses_buka_pintu(key, val):
        global buka_pintu_dari_web
        if isinstance(val, dict) and val.get('command') == 'OPEN':
            admin_email = val.get('requestedBy', 'Admin')
            print(f"\n[CLOUD] 🔓 Perintah BUKA PINTU jarak jauh dari: {admin_email}")
            buka_pintu_dari_web = True
            ref_commands.child(key).delete()

    if event.path == '/':
        if isinstance(event.data, dict):
            for key, val in event.data.items():
                proses_buka_pintu(key, val)
    else:
        proses_buka_pintu(event.path.replace('/', ''), event.data)

# ==========================================
# FUNGSI BARU: VALIDASI QR CODE (GUEST TOKEN)
# ==========================================
def validate_qr_token(token_id: str) -> tuple[bool, str]:
    """
    Memeriksa token_id ke Firebase node 'guest_tokens'.
    QR code menyimpan nilai field 'id' (misal 'Q478KHRR'),
    bukan Firebase push key (misal '-OrC32Zb-XVyPpD2O6iT').
    Jadi kita query semua token lalu cari yang field 'id'-nya cocok.

    Struktur data di Firebase:
    guest_tokens/
      -OrC32Zb-XVyPpD2O6iT/        ← Firebase push key (auto-generated)
        guestName:  "Ganus"
        status:     "active"        → "used" setelah dipakai
        createdAt:  "2026-04-27T03:51:14.538Z"
        expiresAt:  "2026-04-27T04:51:14.538Z"
        createdBy:  "dummy@gmail.com"
        token:      "Q478KHRR"      ← ini yang di-encode ke QR
    """
    try:
        # Cari semua token, filter yang field 'token' == token_id yang di-scan
        all_tokens = ref_tokens.order_by_child('token').equal_to(token_id).get()

        if not all_tokens:
            print(f"[QR] ❌ Token '{token_id}' tidak ditemukan di database.")
            return False, ""

        # Ambil entry pertama yang cocok (seharusnya hanya 1)
        firebase_key = list(all_tokens.keys())[0]
        token_data   = all_tokens[firebase_key]

        status     = token_data.get('status', '')
        guest_name = token_data.get('guestName', 'Guest')
        expires_at = token_data.get('expiresAt', '')
        created_by = token_data.get('createdBy', '')

        # Cek status: hanya 'active' yang boleh masuk
        STATUS_MESSAGES = {
            'used':    f"[QR] ❌ Token '{token_id}' sudah pernah digunakan (one-time pass).",
            'expired': f"[QR] ❌ Token '{token_id}' sudah kedaluwarsa.",
            'revoked': f"[QR] ❌ Token '{token_id}' telah dicabut oleh admin (revoked).",
        }
        if status != 'active':
            print(STATUS_MESSAGES.get(status, f"[QR] ❌ Token '{token_id}' tidak valid (status: {status})."))
            return False, ""

        # Cek kedaluwarsa (format ISO 8601: "2026-04-27T04:51:14.538Z")
        if expires_at:
            try:
                expiry_dt = datetime.strptime(expires_at, "%Y-%m-%dT%H:%M:%S.%fZ")
                if datetime.utcnow() > expiry_dt:
                    print(f"[QR] ❌ Token '{token_id}' sudah kedaluwarsa sejak {expiry_dt}.")
                    # Tandai sebagai expired di database
                    ref_tokens.child(firebase_key).update({'status': 'expired'})
                    return False, ""
            except ValueError:
                print(f"[QR] ⚠️  Format expiresAt tidak dikenali: {expires_at}. Lewati cek kedaluwarsa.")

        # ✅ Token valid — langsung tandai sebagai 'used' (one-time pass)
        ref_tokens.child(firebase_key).update({
            'status': 'used',
            'usedAt': datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
        })
        print(f"[QR] ✅ Token valid! Tamu: {guest_name} (dibuat oleh: {created_by})")
        return True, guest_name

    except Exception as e:
        print(f"[QR] ❌ Gagal memvalidasi token: {e}")
        return False, ""


# ==========================================
# BACKGROUND THREAD: AUTO-EXPIRE TOKENS
# ==========================================
import threading

def auto_expire_tokens():
    """
    Berjalan di background setiap 60 detik.
    Mengecek SEMUA token berstatus 'active' dan otomatis
    mengubahnya ke 'expired' jika waktu expiresAt sudah lewat.
    Ini memastikan Firebase & dashboard web selalu up-to-date
    meskipun tidak ada yang scan QR.
    """
    while True:
        try:
            now = datetime.utcnow()
            active_tokens = ref_tokens.order_by_child('status').equal_to('active').get()

            if active_tokens:
                expired_count = 0
                for firebase_key, token_data in active_tokens.items():
                    expires_at = token_data.get('expiresAt', '')
                    if not expires_at:
                        continue
                    try:
                        expiry_dt = datetime.strptime(expires_at, "%Y-%m-%dT%H:%M:%S.%fZ")
                        if now > expiry_dt:
                            ref_tokens.child(firebase_key).update({'status': 'expired'})
                            guest_name = token_data.get('guestName', '?')
                            print(f"[AUTO-EXPIRE] ⏰ Token '{token_data.get('token', firebase_key)}' ({guest_name}) otomatis kedaluwarsa.")
                            expired_count += 1
                    except ValueError:
                        pass  # Skip token dengan format tanggal tidak dikenali

                if expired_count > 0:
                    print(f"[AUTO-EXPIRE] ✅ {expired_count} token kedaluwarsa diperbarui di Firebase.")

        except Exception as e:
            print(f"[AUTO-EXPIRE] ⚠️ Gagal cek token: {e}")

        time.sleep(60)  # Cek setiap 60 detik

# Jalankan checker di background (daemon=True agar otomatis berhenti saat program ditutup)
expire_thread = threading.Thread(target=auto_expire_tokens, daemon=True)
expire_thread.start()
print("[INFO] ⏰ Auto-expire token checker aktif (interval: 60 detik).")

# ==========================================
# FUNGSI BARU: SCAN QR DARI FRAME KAMERA
# ==========================================
# Cache untuk menghindari scan berulang token yang sama dalam cooldown
_last_qr_token   = None
_last_qr_time    = 0
QR_RESCAN_COOLDOWN = 10  # detik, sebelum token yang sama boleh di-scan ulang

def scan_qr_from_frame(frame) -> tuple[str | None, tuple | None]:
    """
    Membaca QR code dari frame OpenCV.
    Mengembalikan (token_id, bounding_box) atau (None, None) jika tidak ada.
    """
    global _last_qr_token, _last_qr_time

    if not QR_ENABLED:
        return None, None

    decoded_objects = pyzbar.decode(frame)
    for obj in decoded_objects:
        if obj.type == 'QRCODE':
            token_id = obj.data.decode('utf-8').strip()

            # Hindari spam re-scan token yang sama
            if token_id == _last_qr_token and (time.time() - _last_qr_time) < QR_RESCAN_COOLDOWN:
                return None, None

            # Ambil titik sudut untuk menggambar kotak di layar
            points = obj.polygon
            if len(points) == 4:
                pts = np.array([(p.x, p.y) for p in points], dtype=np.int32)
                bbox = cv2.boundingRect(pts)  # (x, y, w, h)
            else:
                bbox = None

            _last_qr_token = token_id
            _last_qr_time  = time.time()
            return token_id, bbox

    return None, None


# ==========================================
# LOAD WAJAH LOKAL
# ==========================================
def load_faces_from_local():
    print("[INFO] Membaca data wajah dari folder lokal 'registered_faces/'...")
    if not os.path.exists('registered_faces'):
        os.makedirs('registered_faces')
        return
    for filename in os.listdir('registered_faces'):
        if filename.endswith('.jpg') or filename.endswith('.png'):
            path_to_file = os.path.join('registered_faces', filename)
            img = face_recognition.load_image_file(path_to_file)
            encodings = face_recognition.face_encodings(img)
            if encodings:
                known_face_encodings.append(encodings[0])
                name = filename.split('.')[0].upper()
                known_face_names.append(name)
                print(f"[SUCCESS] Wajah '{name}' berhasil dipelajari.")

load_faces_from_local()

cap = cv2.VideoCapture(0)
print("[INFO] Kamera Aktif. Menunggu wajah atau QR Code...")

db_listener          = ref_queue.listen(handle_new_registration)
db_listener_commands = ref_commands.listen(handle_door_commands)

# --- VARIABEL TIMER & COOLDOWN ---
cooldown      = False
cooldown_time = 0
face_timers   = {}

last_health_ping    = 0
HEALTH_PING_INTERVAL = 5

# --- FUNGSI Konversi Wajah ke Base64 ---
def get_base64_face(img, y1, x2, y2, x1):
    try:
        pad = 20
        h, w, _ = img.shape
        cropped = img[max(0,y1-pad):min(h,y2+pad), max(0,x1-pad):min(w,x2+pad)]
        resized  = cv2.resize(cropped, (100, 100))
        _, buffer = cv2.imencode('.jpg', resized)
        return f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"
    except Exception as e:
        print(f"[WARNING] Gagal crop wajah: {e}")
        return ""


# ==========================================
# LOOP UTAMA
# ==========================================
while True:
    # 0. DETAK JANTUNG
    current_time = time.time()
    if current_time - last_health_ping > HEALTH_PING_INTERVAL:
        try:
            ref_health.set({
                'last_seen':      int(current_time * 1000),
                'camera_active':  cap.isOpened(),
                'arduino_active': arduino is not None and arduino.is_open,
                'qr_enabled':     QR_ENABLED,
            })
            last_health_ping = current_time
        except:
            pass

    # 1. CEK ANTREAN WAJAH BARU
    if pending_registrations:
        key, nama_user, base64_str = pending_registrations.pop(0)
        print(f"[SYSTEM] ⚙️ Memproses wajah baru: {nama_user}...")
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        path_simpan = os.path.join('registered_faces', f"{nama_user}.jpg")
        try:
            with open(path_simpan, "wb") as fh:
                fh.write(base64.b64decode(base64_str))
            img_baru = face_recognition.load_image_file(path_simpan)
            enc_baru = face_recognition.face_encodings(img_baru)
            if enc_baru:
                known_face_encodings.append(enc_baru[0])
                known_face_names.append(nama_user)
                print(f"[SUCCESS] ✅ Wajah {nama_user} siap digunakan!")
            else:
                print(f"[WARNING] ⚠️ Wajah tidak terdeteksi pada foto {nama_user}")
                os.remove(path_simpan)
            ref_queue.child(key).delete()
            print("[CLOUD] 🧹 Antrean registrasi dibersihkan.")
        except Exception as e:
            print(f"[ERROR] Gagal memproses gambar: {e}")

    # 2. SIAPKAN BENDERA
    perintah_buka_sekarang = False
    metode_akses           = ""
    nama_akses             = ""
    koordinat_wajah        = None

    success, img = cap.read()
    if not success:
        break

    # 3. KONDISI A: PERINTAH WEB
    if buka_pintu_dari_web:
        perintah_buka_sekarang = True
        metode_akses           = "Remote Web Override"
        nama_akses             = "Admin"
        buka_pintu_dari_web    = False

    # ==========================================
    # 4. KONDISI B: SCAN QR CODE (ONE-TIME PASS)
    # ==========================================
    if not perintah_buka_sekarang and not cooldown and QR_ENABLED:
        qr_token, qr_bbox = scan_qr_from_frame(img)

        if qr_token:
            print(f"\n[QR] 🔍 QR Code terdeteksi: '{qr_token}'")

            # Gambar outline QR di layar
            if qr_bbox:
                x, y, w, h = qr_bbox
                cv2.rectangle(img, (x, y), (x+w, y+h), (255, 165, 0), 2)
                cv2.putText(img, "Memvalidasi QR...", (x, y - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 165, 0), 2)

            # Validasi ke Firebase
            is_valid, guest_name = validate_qr_token(qr_token)

            if is_valid:
                perintah_buka_sekarang = True
                metode_akses           = "QR Guest Pass"
                nama_akses             = guest_name

                # Gambar ulang dengan warna hijau jika valid
                if qr_bbox:
                    x, y, w, h = qr_bbox
                    cv2.rectangle(img, (x, y), (x+w, y+h), (0, 255, 0), 3)
                    cv2.putText(img, f"VALID: {guest_name}", (x, y - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            else:
                # Gambar merah jika invalid/expired/used
                if qr_bbox:
                    x, y, w, h = qr_bbox
                    cv2.rectangle(img, (x, y), (x+w, y+h), (0, 0, 255), 3)
                    cv2.putText(img, "AKSES DITOLAK", (x, y - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

    # 5. KONDISI C: FACE RECOGNITION
    if not perintah_buka_sekarang:
        small_frame    = cv2.resize(img, (0,0), fx=0.25, fy=0.25)
        rgb_img_strict = np.ascontiguousarray(
            cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)[:, :, :3], dtype=np.uint8
        )

        facesCurFrame   = face_recognition.face_locations(rgb_img_strict)
        encodesCurFrame = face_recognition.face_encodings(rgb_img_strict, facesCurFrame)
        names_in_current_frame = []

        for encodeFace, faceLoc in zip(encodesCurFrame, facesCurFrame):
            matches  = face_recognition.compare_faces(known_face_encodings, encodeFace, tolerance=TOLERANCE)
            faceDis  = face_recognition.face_distance(known_face_encodings, encodeFace)
            y1, x2, y2, x1 = [v * 4 for v in faceLoc]

            if len(faceDis) > 0:
                matchIndex = np.argmin(faceDis)

                if matches[matchIndex]:
                    name = known_face_names[matchIndex]
                    names_in_current_frame.append(name)
                    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(img, name, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

                    if name not in face_timers:
                        face_timers[name] = time.time()
                    else:
                        elapsed_time = time.time() - face_timers[name]
                        cv2.putText(img, f"Auth: {elapsed_time:.1f}s / {HOLD_TIME}s",
                                    (x1, y2 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                        if elapsed_time >= HOLD_TIME and not cooldown:
                            perintah_buka_sekarang = True
                            metode_akses           = "Face ID"
                            nama_akses             = name
                            koordinat_wajah        = (y1, x2, y2, x1)

                else:
                    name = "UNKNOWN"
                    names_in_current_frame.append(name)
                    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    cv2.putText(img, name, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

                    if name not in face_timers:
                        face_timers[name] = time.time()
                    else:
                        elapsed_time = time.time() - face_timers[name]
                        if elapsed_time >= 3.0 and not cooldown:
                            print(f"\n[WARNING] Penyusup terdeteksi!")
                            base64_image = get_base64_face(img, y1, x2, y2, x1)
                            try:
                                ref_logs.push({
                                    'name':      'UNKNOWN',
                                    'timestamp': str(datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                                    'method':    'Intruder Alert',
                                    'snapshot':  base64_image
                                })
                            except:
                                pass
                            cooldown      = True
                            cooldown_time = time.time()
                            face_timers.pop(name)

        names_to_remove = [n for n in face_timers if n not in names_in_current_frame]
        for n in names_to_remove:
            face_timers.pop(n)

    # ==========================================
    # 6. EKSEKUSI TUNGGAL & LOG KE FIREBASE
    # ==========================================
    if perintah_buka_sekarang and not cooldown:
        print(f"\n[ACTION] Memproses akses untuk: {nama_akses} (Via: {metode_akses})")
        hardware_berhasil = False

        if arduino is not None:
            try:
                arduino.write(b'O')
                print("[HARDWARE] Sinyal 'O' dikirim ke Servo.")
                hardware_berhasil = True
            except Exception as e:
                print(f"[WARNING] Terjadi guncangan USB: {e}")
                print("[SYSTEM] Mengaktifkan protokol Auto-Reconnect dalam 3 detik...")
                time.sleep(3) # Tunggu listrik stabil dan Linux selesai memindah port
                arduino = hubungkan_arduino_otomatis() # Cari port barunya!
        else:
            print("[WARNING] Arduino tidak terhubung. Simulasi pintu terbuka.")
            hardware_berhasil = True

        if hardware_berhasil:
            if koordinat_wajah:
                y1, x2, y2, x1 = koordinat_wajah
                base64_image    = get_base64_face(img, y1, x2, y2, x1)
            else:
                img_kecil = cv2.resize(img, (200, 150))
                _, buffer  = cv2.imencode('.jpg', img_kecil)
                base64_image = f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"

            try:
                ref_logs.push({
                    'name':      nama_akses,
                    'timestamp': str(datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                    'method':    metode_akses,
                    'snapshot':  base64_image
                })
                print("[SUCCESS] Pintu Terbuka! Log tercatat di Cloud.")
            except Exception as e:
                print(f"[ERROR] Gagal kirim log: {e}")
        else:
            print("[FAILED] Hardware gagal. Akses TIDAK dicatat ke Cloud.")

        cooldown      = True
        cooldown_time = time.time()
        if nama_akses in face_timers:
            face_timers.pop(nama_akses)

    # ==========================================
    # 7. MANAJEMEN COOLDOWN & TAMPILAN
    # ==========================================
    if cooldown and (time.time() - cooldown_time > 10):
        cooldown = False
        print("[SYSTEM] Siap memindai lagi.")

    # HUD: tampilkan mode aktif di pojok layar
    mode_text = "MODE: Face ID"
    if QR_ENABLED:
        mode_text += " + QR Pass"
    cv2.putText(img, mode_text, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)

    cv2.imshow('Smart Door Lock', img)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ==========================================
# 8. CLEANUP
# ==========================================
cap.release()
cv2.destroyAllWindows()

if 'arduino' in locals() and arduino is not None and arduino.is_open:
    arduino.close()
    print("[INFO] Koneksi ke Arduino ditutup.")

if 'db_listener' in locals():
    db_listener.close()

if 'db_listener_commands' in locals():
    db_listener_commands.close()

print("[SYSTEM] Program dihentikan. Sampai jumpa!")
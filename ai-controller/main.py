"""
Smart Door Lock - Main Program
Optimizations applied:
 - Face recognition runs on every Nth frame (FRAME_SKIP) to reduce CPU load
 - Uses face_recognition model="small" (5x faster, ~1% less accurate)
 - number_of_times_to_upsample=0 skips upscaling → faster face location
 - Firebase log pushes run in a background thread (non-blocking main loop)
 - Camera buffer size set to 1 → always processes the latest frame
 - Face encoding on registration uses model="small" for consistency
 - Hardware: Relay solenoid langsung via GPIO Raspberry Pi (gpiozero), tanpa Arduino
"""


import cv2
import face_recognition
import numpy as np
import time
import threading
from datetime import datetime
import os
import base64
from firebase_config import initialize_firebase
from gpiozero import OutputDevice


# ==========================================
# QR CODE SUPPORT
# ==========================================
try:
   from pyzbar import pyzbar
   QR_ENABLED = True
   print("[INFO] ✅ QR Code scanner aktif (pyzbar ditemukan).")
except ImportError:
   QR_ENABLED = False
   print("[WARNING] ⚠️  pyzbar tidak ditemukan. Install: pip install pyzbar")


# ==========================================
# KONFIGURASI
# ==========================================
GPIO_RELAY_PIN       = 17     # GPIO BCM pin untuk relay solenoid (fisik pin 11)
RELAY_HOLD_TIME      = 3      # detik relay ON (pintu terbuka)
HOLD_TIME            = 2.0    # detik wajah harus terdeteksi sebelum pintu terbuka
TOLERANCE            = 0.45   # sedikit lebih longgar untuk model="small"
FRAME_SKIP           = 3      # proses face recognition setiap N frame (1 = setiap frame)
INTRUDER_HOLD        = 3.0    # detik hingga UNKNOWN dianggap penyusup
COOLDOWN_DURATION    = 5    # detik cooldown setelah pintu terbuka
HEALTH_PING_INTERVAL = 3      # detik interval kirim system health ke Firebase
QR_RESCAN_COOLDOWN   = 5     # detik sebelum QR yang sama boleh di-scan ulang
AUTO_EXPIRE_INTERVAL = 60     # detik interval auto-expire token


# ==========================================
# RELAY SOLENOID (GPIO Raspberry Pi langsung)
# ==========================================
# active_high=False karena modul relay biru bersifat Active-LOW
# (LOW = relay ON = solenoid menarik = pintu terbuka)
try:
   relay_pintu = OutputDevice(GPIO_RELAY_PIN, active_high=False, initial_value=False)
   print(f"[SUCCESS] ✅ Relay solenoid siap di GPIO {GPIO_RELAY_PIN}.")
except Exception as e:
   print(f"[ERROR] Gagal inisialisasi relay GPIO: {e}")
   relay_pintu = None


def buka_pintu_relay():
   """Aktifkan relay selama RELAY_HOLD_TIME detik lalu matikan kembali."""
   if relay_pintu is None:
       print("[WARNING] Relay tidak tersedia. Simulasi buka pintu.")
       return False
   try:
       relay_pintu.on()                  # solenoid menarik, pintu terbuka
       time.sleep(RELAY_HOLD_TIME)       # tahan selama N detik
       relay_pintu.off()                 # solenoid lepas, pintu terkunci kembali
       return True
   except Exception as e:
       print(f"[ERROR] Gagal mengontrol relay: {e}")
       relay_pintu.off()                 # pastikan relay mati jika error
       return False


# ==========================================
# FIREBASE
# ==========================================
db_conn      = initialize_firebase()
ref_logs     = db_conn.reference('logs')
ref_queue    = db_conn.reference('registration_queue')
ref_commands = db_conn.reference('door_commands')
ref_health   = db_conn.reference('system_health')
ref_tokens   = db_conn.reference('guest_tokens')


# ==========================================
# STATE GLOBAL
# ==========================================
known_face_encodings  = []   # list of np.ndarray
known_face_names      = []   # list of str — index-aligned dengan encodings
pending_registrations = []   # antrean wajah baru dari Firebase
buka_pintu_dari_web   = False


# ==========================================
# FIREBASE LISTENERS
# ==========================================
def proses_data_wajah(key, val):
   if isinstance(val, dict) and 'name' in val and 'image_base64' in val:
       pending_registrations.append((key, val['name'], val['image_base64']))
       print(f"\n[CLOUD] 📥 Wajah baru diterima: {val['name']}")


def handle_new_registration(event):
   if event.data is None:
       return
   if event.path == '/':
       if isinstance(event.data, dict):
           for key, val in event.data.items():
               proses_data_wajah(key, val)
   else:
       proses_data_wajah(event.path.lstrip('/'), event.data)


def handle_door_commands(event):
   global buka_pintu_dari_web
   if event.data is None:
       return


   def proses(key, val):
       global buka_pintu_dari_web
       if isinstance(val, dict) and val.get('command') == 'OPEN':
           print(f"\n[CLOUD] 🔓 Perintah BUKA dari: {val.get('requestedBy', 'Admin')}")
           buka_pintu_dari_web = True
           ref_commands.child(key).delete()


   if event.path == '/':
       if isinstance(event.data, dict):
           for key, val in event.data.items():
               proses(key, val)
   else:
       proses(event.path.lstrip('/'), event.data)


# ==========================================
# QR TOKEN VALIDATION
# ==========================================
STATUS_MESSAGES = {
   'used':    "sudah pernah digunakan (one-time pass)",
   'expired': "sudah kedaluwarsa",
   'revoked': "telah dicabut oleh admin",
}


def validate_qr_token(token_id: str) -> tuple[bool, str]:
   """
   Validasi QR token terhadap Firebase 'guest_tokens'.
   QR encode field 'token' (misal 'Q478KHRR'), bukan Firebase push key.
   """
   try:
       all_tokens = ref_tokens.order_by_child('token').equal_to(token_id).get()
       if not all_tokens:
           print(f"[QR] ❌ Token '{token_id}' tidak ditemukan.")
           return False, ""


       firebase_key = next(iter(all_tokens))
       token_data   = all_tokens[firebase_key]
       status       = token_data.get('status', '')
       guest_name   = token_data.get('guestName', 'Guest')
       expires_at   = token_data.get('expiresAt', '')
       created_by   = token_data.get('createdBy', '')


       if status != 'active':
           reason = STATUS_MESSAGES.get(status, f"tidak valid (status: {status})")
           print(f"[QR] ❌ Token '{token_id}' {reason}.")
           return False, ""


       # Cek waktu kedaluwarsa
       if expires_at:
           try:
               expiry_dt = datetime.strptime(expires_at, "%Y-%m-%dT%H:%M:%S.%fZ")
               if datetime.utcnow() > expiry_dt:
                   print(f"[QR] ❌ Token '{token_id}' kedaluwarsa sejak {expiry_dt}.")
                   ref_tokens.child(firebase_key).update({'status': 'expired'})
                   return False, ""
           except ValueError:
               print(f"[QR] ⚠️  Format expiresAt tidak dikenali: {expires_at}")


       # ✅ Tandai sebagai 'used' (one-time pass)
       ref_tokens.child(firebase_key).update({
           'status': 'used',
           'usedAt': datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
       })
       print(f"[QR] ✅ Token valid! Tamu: {guest_name} (oleh: {created_by})")
       return True, guest_name


   except Exception as e:
       print(f"[QR] ❌ Gagal validasi token: {e}")
       return False, ""


# ==========================================
# BACKGROUND: AUTO-EXPIRE TOKENS
# ==========================================
def auto_expire_tokens():
   """Cek & update token kedaluwarsa setiap AUTO_EXPIRE_INTERVAL detik."""
   while True:
       try:
           now           = datetime.utcnow()
           active_tokens = ref_tokens.order_by_child('status').equal_to('active').get()
           if active_tokens:
               count = 0
               for fb_key, data in active_tokens.items():
                   exp = data.get('expiresAt', '')
                   if not exp:
                       continue
                   try:
                       if now > datetime.strptime(exp, "%Y-%m-%dT%H:%M:%S.%fZ"):
                           ref_tokens.child(fb_key).update({'status': 'expired'})
                           print(f"[AUTO-EXPIRE] ⏰ {data.get('token','?')} ({data.get('guestName','?')}) kedaluwarsa.")
                           count += 1
                   except ValueError:
                       pass
               if count:
                   print(f"[AUTO-EXPIRE] ✅ {count} token diperbarui.")
       except Exception as e:
           print(f"[AUTO-EXPIRE] ⚠️ {e}")
       time.sleep(AUTO_EXPIRE_INTERVAL)


threading.Thread(target=auto_expire_tokens, daemon=True).start()
print(f"[INFO] ⏰ Auto-expire aktif (interval: {AUTO_EXPIRE_INTERVAL}s).")


# ==========================================
# BACKGROUND: NON-BLOCKING FIREBASE LOG
# ==========================================
def push_log_async(payload: dict):
   """Kirim log ke Firebase di thread terpisah agar tidak memblokir main loop."""
   def _push():
       try:
           ref_logs.push(payload)
       except Exception as e:
           print(f"[ERROR] Gagal kirim log: {e}")
   threading.Thread(target=_push, daemon=True).start()


# ==========================================
# QR SCANNER
# ==========================================
_last_qr_token = None
_last_qr_time  = 0.0


def scan_qr_from_frame(frame) -> tuple[str | None, tuple | None]:
   """Baca QR dari frame. Kembalikan (token_id, bbox) atau (None, None)."""
   global _last_qr_token, _last_qr_time
   if not QR_ENABLED:
       return None, None


   for obj in pyzbar.decode(frame):
       if obj.type != 'QRCODE':
           continue
       token_id = obj.data.decode('utf-8').strip()
       now      = time.time()
       if token_id == _last_qr_token and (now - _last_qr_time) < QR_RESCAN_COOLDOWN:
           return None, None
       _last_qr_token = token_id
       _last_qr_time  = now
       pts  = obj.polygon
       bbox = cv2.boundingRect(np.array([(p.x, p.y) for p in pts], np.int32)) if len(pts) == 4 else None
       return token_id, bbox


   return None, None


# ==========================================
# FACE UTILS
# ==========================================
def get_base64_face(img, y1, x2, y2, x1, size: int = 100) -> str:
   """Crop & encode wajah ke base64 JPEG."""
   try:
       pad = 20
       h, w = img.shape[:2]
       crop = img[max(0, y1-pad):min(h, y2+pad), max(0, x1-pad):min(w, x2+pad)]
       _, buf = cv2.imencode('.jpg', cv2.resize(crop, (size, size)),
                             [cv2.IMWRITE_JPEG_QUALITY, 80])
       return "data:image/jpeg;base64," + base64.b64encode(buf).decode()
   except Exception as e:
       print(f"[WARNING] Gagal crop wajah: {e}")
       return ""


def get_base64_frame(img, width: int = 200, height: int = 150) -> str:
   """Encode seluruh frame ke base64 JPEG (fallback snapshot)."""
   _, buf = cv2.imencode('.jpg', cv2.resize(img, (width, height)),
                         [cv2.IMWRITE_JPEG_QUALITY, 70])
   return "data:image/jpeg;base64," + base64.b64encode(buf).decode()


def load_faces_from_local():
   """
   Muat encoding wajah dari folder 'registered_faces/'.
   Menggunakan model='small' (HOG-based, 5x lebih cepat dari 'large').
   """
   print("[INFO] Membaca wajah dari 'registered_faces/'...")
   os.makedirs('registered_faces', exist_ok=True)
   for fn in os.listdir('registered_faces'):
       if not fn.lower().endswith(('.jpg', '.png')):
           continue
       path = os.path.join('registered_faces', fn)
       img  = face_recognition.load_image_file(path)
       encs = face_recognition.face_encodings(img, model="small")
       if encs:
           known_face_encodings.append(encs[0])
           known_face_names.append(fn.split('.')[0].upper())
           print(f"[SUCCESS] Wajah '{fn.split('.')[0].upper()}' dipelajari.")


load_faces_from_local()


# ==========================================
# KAMERA
# ==========================================
# --- SCRIPT AUTO-DETECT KAMERA ---
print("[INFO] Mencari alamat kamera yang valid...")
cap = None
for i in range(4): # Coba dari indeks 0, 1, 2, 3
   temp_cap = cv2.VideoCapture(i, cv2.CAP_V4L2)
   if temp_cap.isOpened():
       ret, frame = temp_cap.read()
       if ret: # Jika berhasil menangkap gambar
           cap = temp_cap
           print(f"[SUCCESS] Kamera aktif di /dev/video{i}!")
           break
       else:
           temp_cap.release()


if cap is None:
   print("[ERROR] Tidak ada satupun kamera yang memberikan gambar. Periksa kabel USB!")
   # Jika gagal, tetap buat dummy cap agar program tidak error
   cap = cv2.VideoCapture(0)


cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
print("[INFO] Sistem AI siap. Menunggu wajah atau QR Code...")




# ==========================================
# FIREBASE LISTENERS START
# ==========================================
db_listener          = ref_queue.listen(handle_new_registration)
db_listener_commands = ref_commands.listen(handle_door_commands)


# ==========================================
# STATE LOOP
# ==========================================
cooldown         = False
cooldown_time    = 0.0
face_timers      = {}       # {name: first_seen_timestamp}
last_health_ping = 0.0
frame_counter    = 0


# Cache hasil face recognition (diperbarui setiap FRAME_SKIP frame)
cached_face_data = []   # list of (name, x1, y1, x2, y2)


# ==========================================
# MAIN LOOP
# ==========================================
while True:


   # ------------------------------------------
   # 0. SYSTEM HEALTH PING
   # ------------------------------------------
   now = time.time()
   if now - last_health_ping > HEALTH_PING_INTERVAL:
       try:
           ref_health.set({
               'last_seen':      int(now * 1000),
               'camera_active':  cap.isOpened(),
               'relay_active':   relay_pintu is not None,
               'qr_enabled':     QR_ENABLED,
           })
           last_health_ping = now
       except:
           pass


   # ------------------------------------------
   # 1. PROSES ANTREAN REGISTRASI WAJAH BARU
   # ------------------------------------------
   if pending_registrations:
       key, nama_user, base64_str = pending_registrations.pop(0)
       print(f"[SYSTEM] ⚙️  Memproses wajah baru: {nama_user}...")
       if "," in base64_str:
           base64_str = base64_str.split(",", 1)[1]
       path_simpan = os.path.join('registered_faces', f"{nama_user}.jpg")
       try:
           with open(path_simpan, "wb") as fh:
               fh.write(base64.b64decode(base64_str))
           img_baru = face_recognition.load_image_file(path_simpan)
           enc_baru = face_recognition.face_encodings(img_baru, model="small")
           if enc_baru:
               known_face_encodings.append(enc_baru[0])
               known_face_names.append(nama_user)
               cached_face_data.clear()   # reset cache supaya wajah baru langsung aktif
               print(f"[SUCCESS] ✅ Wajah {nama_user} siap!")
           else:
               print(f"[WARNING] ⚠️  Wajah tidak terdeteksi pada foto {nama_user}.")
               os.remove(path_simpan)
           ref_queue.child(key).delete()
           print("[CLOUD] 🧹 Antrean registrasi dibersihkan.")
       except Exception as e:
           print(f"[ERROR] Gagal memproses gambar: {e}")


   # ------------------------------------------
   # 2. BACA FRAME
   # ------------------------------------------
   success, img = cap.read()
   if not success:
       print("[ERROR] Gagal membaca frame kamera. Keluar...")
       break
   frame_counter += 1


   # ------------------------------------------
   # 3. INISIALISASI BENDERA AKSES
   # ------------------------------------------
   perintah_buka   = False
   metode_akses    = ""
   nama_akses      = ""
   koordinat_wajah = None


   # ------------------------------------------
   # 4. KONDISI A: PERINTAH BUKA DARI WEB
   # ------------------------------------------
   if buka_pintu_dari_web:
       perintah_buka       = True
       metode_akses        = "Remote Web Override"
       nama_akses          = "Admin"
       buka_pintu_dari_web = False


   # ------------------------------------------
   # 5. KONDISI B: SCAN QR CODE
   # ------------------------------------------
   if not perintah_buka and not cooldown and QR_ENABLED:
       qr_token, qr_bbox = scan_qr_from_frame(img)
       if qr_token:
           print(f"\n[QR] 🔍 QR terdeteksi: '{qr_token}'")
           if qr_bbox:
               x, y, w, h = qr_bbox
               cv2.rectangle(img, (x, y), (x+w, y+h), (255, 165, 0), 2)
               cv2.putText(img, "Memvalidasi...", (x, y-10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 165, 0), 2)


           is_valid, guest_name = validate_qr_token(qr_token)
           color = (0, 255, 0) if is_valid else (0, 0, 255)
           label = f"VALID: {guest_name}" if is_valid else "AKSES DITOLAK"


           if qr_bbox:
               x, y, w, h = qr_bbox
               cv2.rectangle(img, (x, y), (x+w, y+h), color, 3)
               cv2.putText(img, label, (x, y-10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
           if is_valid:
               perintah_buka = True
               metode_akses  = "QR Guest Pass"
               nama_akses    = guest_name


   # ------------------------------------------
   # 6. KONDISI C: FACE RECOGNITION
   #    Hanya dijalankan setiap FRAME_SKIP frame
   #    untuk mengurangi beban CPU secara signifikan.
   # ------------------------------------------
   if not perintah_buka and (frame_counter % FRAME_SKIP == 0):
       # Resize 25% untuk deteksi cepat
       small = cv2.resize(img, (0, 0), fx=0.25, fy=0.25)
       rgb   = np.ascontiguousarray(
           cv2.cvtColor(small, cv2.COLOR_BGR2RGB)[:, :, :3], dtype=np.uint8
       )


       # number_of_times_to_upsample=0 → skip upscaling → lebih cepat ~2x
       face_locs = face_recognition.face_locations(rgb, number_of_times_to_upsample=0)
       face_encs = face_recognition.face_encodings(rgb, face_locs, model="small")


       cached_face_data = []
       names_this_frame = []


       for enc, loc in zip(face_encs, face_locs):
           y1, x2, y2, x1 = [v * 4 for v in loc]   # scale back ke ukuran penuh


           if not known_face_encodings:
               name = "UNKNOWN"
           else:
               distances = face_recognition.face_distance(known_face_encodings, enc)
               best_idx  = int(np.argmin(distances))
               name      = known_face_names[best_idx] if distances[best_idx] <= TOLERANCE else "UNKNOWN"


           cached_face_data.append((name, x1, y1, x2, y2))
           names_this_frame.append(name)


       # Bersihkan timer untuk wajah yang tidak lagi terdeteksi di frame ini
       for n in [k for k in list(face_timers) if k not in names_this_frame]:
           face_timers.pop(n, None)


   # ------------------------------------------
   # 7. RENDER HASIL & KELOLA TIMER WAJAH
   # ------------------------------------------
   names_in_frame = []
   for name, x1, y1, x2, y2 in cached_face_data:
       names_in_frame.append(name)


       if name != "UNKNOWN":
           cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
           cv2.putText(img, name, (x1, y1-10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)


           if name not in face_timers:
               face_timers[name] = time.time()
           else:
               elapsed = time.time() - face_timers[name]
               cv2.putText(img, f"Auth: {elapsed:.1f}s / {HOLD_TIME}s",
                           (x1, y2+25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
               if elapsed >= HOLD_TIME and not cooldown and not perintah_buka:
                   perintah_buka   = True
                   metode_akses    = "Face ID"
                   nama_akses      = name
                   koordinat_wajah = (y1, x2, y2, x1)
       else:
           cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 2)
           cv2.putText(img, "UNKNOWN", (x1, y1-10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)


           if "UNKNOWN" not in face_timers:
               face_timers["UNKNOWN"] = time.time()
           else:
               elapsed = time.time() - face_timers["UNKNOWN"]
               if elapsed >= INTRUDER_HOLD and not cooldown:
                   print("\n[WARNING] 🚨 Penyusup terdeteksi!")
                   snapshot = get_base64_face(img, y1, x2, y2, x1)
                   push_log_async({
                       'name':      'UNKNOWN',
                       'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                       'method':    'Intruder Alert',
                       'snapshot':  snapshot,
                   })
                   cooldown      = True
                   cooldown_time = time.time()
                   face_timers.pop("UNKNOWN", None)


   # Bersihkan timer wajah yang sudah tidak di frame
   for n in [k for k in list(face_timers) if k not in names_in_frame]:
       face_timers.pop(n, None)


   # ------------------------------------------
   # 8. EKSEKUSI AKSES: HARDWARE + LOG
   # ------------------------------------------
   if perintah_buka and not cooldown:
       print(f"\n[ACTION] Akses: {nama_akses} via {metode_akses}")
       # Gunakan list sebagai container mutable agar bisa diubah dari dalam thread
       hasil = [False]


       def _trigger_relay():
           hasil[0] = buka_pintu_relay()


       relay_thread = threading.Thread(target=_trigger_relay, daemon=True)
       relay_thread.start()
       relay_thread.join(timeout=RELAY_HOLD_TIME + 2)
       hardware_ok = hasil[0]


       if hardware_ok:
           if koordinat_wajah:
               y1, x2, y2, x1 = koordinat_wajah
               snapshot = get_base64_face(img, y1, x2, y2, x1)
           else:
               snapshot = get_base64_frame(img)


           push_log_async({
               'name':      nama_akses,
               'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
               'method':    metode_akses,
               'snapshot':  snapshot,
           })
           print("[SUCCESS] 🔓 Pintu terbuka! Log dikirim ke Cloud.")
       else:
           print("[FAILED] ❌ Hardware gagal. Akses TIDAK dicatat.")


       cooldown      = True
       cooldown_time = time.time()
       face_timers.pop(nama_akses, None)


   # ------------------------------------------
   # 9. COOLDOWN & HUD
   # ------------------------------------------
   if cooldown and (time.time() - cooldown_time > COOLDOWN_DURATION):
       cooldown = False
       print("[SYSTEM] ✅ Siap memindai lagi.")


   mode_label = "Face ID + QR Pass" if QR_ENABLED else "Face ID"
   cv2.putText(img, f"MODE: {mode_label}", (10, 25),
               cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)
   if cooldown:
       sisa = max(0, COOLDOWN_DURATION - (time.time() - cooldown_time))
       cv2.putText(img, f"COOLDOWN: {sisa:.1f}s", (10, 50),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 165, 255), 1)


   cv2.imshow('Smart Door Lock', img)
   if cv2.waitKey(1) & 0xFF == ord('q'):
       break


# ==========================================
# CLEANUP
# ==========================================
cap.release()
cv2.destroyAllWindows()


if relay_pintu is not None:
   relay_pintu.off()   # pastikan solenoid mati saat program berhenti
   relay_pintu.close() # lepas GPIO pin
   print("[INFO] Relay GPIO dimatikan dan dirilis.")


if 'db_listener' in locals():
   db_listener.close()
if 'db_listener_commands' in locals():
   db_listener_commands.close()


print("[SYSTEM] Program dihentikan. Sampai jumpa!")









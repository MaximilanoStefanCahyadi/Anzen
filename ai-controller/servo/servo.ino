// ==========================================
// KODE ARDUINO: DOOR LOCK SOLENOIDA + RELAY
// ==========================================

// --- KONFIGURASI ---
const int relayPin = 9;          // Pin Arduino yang terhubung ke pin 'IN' pada Relay
const int unlockTime = 3000;     // Waktu pintu dibiarkan terbuka: 3000 milidetik (3 detik)

void setup() {
  // 1. Mulai komunikasi jalur Serial (USB) dengan Python di kecepatan 9600
  Serial.begin(9600);
  
  // 2. Atur pin 9 sebagai pin Output (pengirim sinyal listrik)
  pinMode(relayPin, OUTPUT);
  
  // 3. Pastikan Relay dalam keadaan MATI saat Arduino baru dinyalakan
  digitalWrite(relayPin, HIGH); 
}

void loop() {
  // Mengecek apakah ada pesan masuk dari kabel USB (dikirim oleh Python)
  if (Serial.available() > 0) {
    
    // Baca satu huruf yang dikirim
    char command = Serial.read(); 

    // Jika Python mengirim huruf 'O' (Buka Pintu)
    if (command == 'O' || command == 'o') {
      
      // --- FASE 1: BUKA PINTU ---
      // Kirim sinyal menyala ke Relay. 
      // Relay akan bunyi "Cetek!", menyambungkan listrik 11.1V baterai ke Solenoida.
      digitalWrite(relayPin, LOW);
      
      // --- FASE 2: TAHAN ---
      // Tahan selama 3 detik. 
      // PERINGATAN: Bagian ini WAJIB ada agar Solenoida Anda tidak meleleh!
      delay(unlockTime);
      
      // --- FASE 3: KUNCI KEMBALI ---
      // Putus sinyal listrik ke Relay.
      // Relay mati, aliran listrik dari baterai terputus, per pegas akan mendorong besi Solenoida keluar.
      digitalWrite(relayPin, HIGH);
      
    }
  }
}
# Desain Sistem Telemetri & MQTT (TREM-KU)

Dokumen ini berfungsi sebagai acuan standar (Standard Operating Procedure / Blueprint) bagi tim *engineering* yang bertugas mengembangkan komponen Edge / Otonom (seperti sistem **ROS2**) di PC lokal (on-board) yang berada di atas armada trem.

## 1. Arsitektur Komunikasi & Jaringan
Komunikasi antara Edge (ROS2 pada Trem) dengan Cloud (API Server TREM-KU) difasilitasi oleh **EMQX MQTT Broker** terpusat. Karena server berada di balik **Cloudflare Zero Trust Tunnels**, koneksi tidak menggunakan TCP murni (port 1883), melainkan menggunakan **MQTT over WebSockets**.

- **Protokol Koneksi:** WebSocket Secure (WSS)
- **URL Broker:** `wss://<domain-mqtt-anda>.com:443` *(Ganti dengan public hostname Cloudflare Anda, misal: wss://mqtt.tremku.com:443)*
- **Topik Publish (Dari Trem ke Server):** `tremku/telemetry/<trem_id>` (contoh: `tremku/telemetry/TRM-01`)
- **Topik Subscribe (Dari Server ke Trem):** `tremku/command/<trem_id>` (contoh: `tremku/command/TRM-01`)
- **Frekuensi (QoS):** Disarankan di-*publish* setiap 1 detik (1 Hz) dengan QoS 0 atau 1.

## 2. Struktur Payload (JSON) Telemetri
Sistem ROS2 Anda harus mengonversi data raw dari *nodes* (Encoder, Lidar, GPS, Baterai BMS) menjadi objek JSON tunggal sebelum di-*publish* ke MQTT. 

Berikut adalah **Skema Standar JSON** yang diwajibkan agar dapat diproses oleh AI Server (KOMANDO & DINUS):

```json
{
  "trem_id": "TRM-01",
  "sensors": {
    "lidar": {
      "status": "ok",
      "obstacle_in_path": false,
      "nearest_obstacle_m": null
    },
    "object_detection": {
      "status": "ok",
      "objects": []
    },
    "imu": {
      "status": "ok",
      "pitch_deg": 0.0,
      "roll_deg": 0.0
    },
    "gps": {
      "status": "ok",
      "latitude": -6.968123,
      "longitude": 110.427456
    }
  },
  "vehicle": {
    "battery_percent": 85.0,
    "motor_temperature_c": 32.5,
    "speed_kmh": 12.3
  }
}
```

### 2.1 Definisi Field Penting (Wajib):
- `trem_id`: ID unik untuk trem tersebut (misal: `"TRM-01"`, `"TRM-02"`). Data ini vital agar KOMANDO di server bisa membedakan armada satu dengan lainnya.
- `gps.latitude` & `gps.longitude`: Harus berupa angka desimal bertipe *Float*. Data ini sangat dibutuhkan oleh agen DINUS untuk mencari landmark dan merangkai *storytelling* yang sesuai dengan posisi.
- `vehicle.speed_kmh`: Kecepatan aktual dalam km/jam. Anda harus membuat node ROS2 yang mengonversi angka *ticks* dari sensor *rotary encoder* di roda/motor menjadi satuan *speed* (km/h) sebelum dienkapsulasi ke JSON ini.
- `vehicle.battery_percent`: Diambil langsung dari BMS (Battery Management System).

## 3. Penanganan Command dari Server (NARA/KOMANDO)
Sistem otonom/ROS2 harus melakukan *subscribe* ke topik `tremku/command/<trem_id>` untuk mendengarkan perintah (intervensi) dari server.

Jika KOMANDO mendeteksi bahaya dan perlu mengirimkan perintah deselerasi/rem, payload JSON yang akan diterima oleh trem Anda adalah:
```json
{
  "command": "SLOWDOWN",
  "reason": "Darurat: Penumpang meminta penghentian mendadak.",
  "timestamp": "2026-09-16T12:00:00Z"
}
```
*Node* pengontrol (*vehicle controller*) di ROS2 harus mendengarkan payload ini dan secara fisik mengaktifkan aktuator pengereman ketika *command* `"SLOWDOWN"` diterima.

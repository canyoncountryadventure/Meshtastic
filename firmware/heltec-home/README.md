# Heltec Home Node Firmware

## Current build

- Device: Heltec WiFi LoRa 32 V4 with TFT expansion
- Meshtastic hardware model: `HELTEC_V4`
- PlatformIO environment: `heltec-v4-tft`
- Firmware version: `2.7.26.54e0d8d`
- Firmware target: `firmware-heltec-v4-tft-2.7.26.54e0d8d.bin`
- MCU: ESP32-S3
- USB flash port during setup: COM20
- Node name: Heltec Hub
- Short name: Home

## Verified release archive

Downloaded official Meshtastic ESP32-S3 release archive:

`firmware-esp32s3-2.7.26.54e0d8d.zip`

SHA-256:

`67F94BB2F0FE32C0F64D34429527E89FCB3D3C84FA444965987E297CE80745D1`

Local copy:

`C:\Meshtastic-Trail-Test\Heltec-Home\firmware\`

## Flash procedure used

1. Hold LEFT/PRG.
2. Tap RIGHT/RST once.
3. Release LEFT/PRG.
4. Confirm ESP32-S3 bootloader with `py -m esptool --port COM20 chip-id`.
5. Flash update image without factory erase:

```powershell
.\device-update.bat `
  -f "firmware-heltec-v4-tft-2.7.26.54e0d8d.bin" `
  -p COM20 `
  -P "C:\Users\colte\AppData\Local\Python\pythoncore-3.14-64\python.exe"
```

6. Verify Meshtastic reports:
   - `firmwareVersion: 2.7.26.54e0d8d`
   - `pioEnv: heltec-v4-tft`
   - `hwModel: HELTEC_V4`

## Backup policy

The full Meshtastic configuration backup remains local only because it can contain private keys and credentials:

`C:\Meshtastic-Trail-Test\Heltec-Home\backup\`

Do not commit exported configuration files, Meshtastic private keys, Wi-Fi passwords, MQTT passwords, or channel secrets to this public repository.

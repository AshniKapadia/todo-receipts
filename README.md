# To-Do Receipts

Generate thermal printer-style receipts for daily tasks. Manage tasks through a web dashboard, print them to a physical thermal printer from anywhere.

## Architecture

The system has two parts:

1. **Cloud server** (Railway) — hosts the web dashboard and stores tasks in SQLite. When you click Print, it queues a print job.
2. **Local polling agent** (Raspberry Pi or Mac) — polls the cloud every 5 seconds, picks up print jobs, and fires the thermal printer over USB.

This separation means you can trigger a print from any device (phone, laptop, etc.) and the printer in the corner does the work without anything else needing to be open.

## Cloud Deployment (Railway)

The server is deployed at `https://todo-receipts-production.up.railway.app`.

Required environment variables in Railway:
- `PORT` — set automatically by Railway
- `DATA_DIR` — path for SQLite database persistence (set to `/data` and mount a volume)

To redeploy after changes:
```bash
git push origin main
```

Railway auto-deploys on push to main.

## Printer Setup

### Hardware

Printer: Touch Dynamic LK-T210 (Sewoo OEM)
- USB VID:PID: `0525:a700`
- Paper width: 80mm
- Resolution: 203 DPI

Configure the printer in `~/.todo-receipts/config.json`:
```json
{
  "printer": "usb:0525:a700",
  "serverPort": 3000
}
```

Or via CLI:
```bash
todo-receipts config --set printer=usb:0525:a700
```

### Logo

Place a PNG logo at `~/.todo-receipts/logo.png`. It will be printed at the top of each receipt, resized to 200 dots wide. Transparent pixels are preserved — the printer background shows through.

## Raspberry Pi Setup (Recommended)

Running the polling agent on a Raspberry Pi lets the printer sit anywhere with power and WiFi, completely independent of any computer.

### Hardware

**Recommended: Raspberry Pi 3B or newer.**

The Pi Zero 2 W technically works but has a weak WiFi antenna and slow processor that make setup difficult (see Troubleshooting below). The Pi 3B is more reliable and setup is much faster.

### Flash the SD Card

1. Download and open [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
2. Choose OS: Raspberry Pi OS Lite (64-bit)
3. Choose your SD card
4. Click Edit Settings before writing:
   - Hostname: `todo-printer`
   - Username: your choice (e.g. `ashni`)
   - Password: set something you will remember
   - WiFi: your network SSID and password
   - Enable SSH under the Services tab
5. When prompted "Apply OS customisation settings?" click **Yes**
6. Write and wait for it to finish

### First Boot

Insert SD card, plug Pi into power, wait 2 minutes, then:

```bash
ping todo-printer.local
```

Once it responds, SSH in:

```bash
ssh youruser@todo-printer.local
```

### Install Dependencies

```bash
sudo apt install -y nodejs npm
```

### Copy Files from Mac

On your Mac, copy the project files to the Pi:

```bash
ssh youruser@todo-printer.local "mkdir ~/todo-receipts"
scp -r /path/to/claude-receipts/dist youruser@todo-printer.local:/home/youruser/todo-receipts/
scp /path/to/claude-receipts/package.json youruser@todo-printer.local:/home/youruser/todo-receipts/
scp /path/to/claude-receipts/poll-and-print.js youruser@todo-printer.local:/home/youruser/todo-receipts/
```

Copy config and logo:

```bash
ssh youruser@todo-printer.local "mkdir ~/.todo-receipts"
scp ~/.todo-receipts/config.json youruser@todo-printer.local:/home/youruser/.todo-receipts/
scp ~/.todo-receipts/logo.png youruser@todo-printer.local:/home/youruser/.todo-receipts/
```

### Install npm Dependencies

On the Pi:

```bash
cd ~/todo-receipts && npm install --omit=dev
```

### USB Printer Permissions

Create a udev rule so Node.js can access the USB printer without root:

```bash
sudo cp /path/to/pi/99-thermal-printer.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
```

Or create it manually:

```bash
sudo nano /etc/udev/rules.d/99-thermal-printer.rules
```

Contents:
```
SUBSYSTEM=="usb", ATTRS{idVendor}=="0525", ATTRS{idProduct}=="a700", MODE="0666"
```

### Set Up Auto-Start Service

Copy the systemd service file:

```bash
sudo cp /path/to/pi/todo-receipts-printer.service /etc/systemd/system/
```

Edit it to match your username and paths if needed:

```bash
sudo nano /etc/systemd/system/todo-receipts-printer.service
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable todo-receipts-printer
sudo systemctl start todo-receipts-printer
```

Check it is running:

```bash
sudo systemctl status todo-receipts-printer
```

Plug the printer USB cable into the Pi, go to the Railway dashboard, and click Print Receipt.

### Checking Logs

```bash
sudo journalctl -u todo-receipts-printer -n 50
```

## macOS Launch Agent (Alternative to Pi)

If you want the polling agent running on your Mac instead of a Pi:

```bash
cp com.ashni.todo-receipts-printer.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ashni.todo-receipts-printer.plist
```

This runs in the background whenever your Mac is on. Logs go to `~/.todo-receipts/printer-agent.log`.

To stop it:

```bash
launchctl unload ~/Library/LaunchAgents/com.ashni.todo-receipts-printer.plist
```

## Local Development

```bash
npm install
npm run build
node bin/todo-receipts.js serve
```

## Commands

### serve
Start the web dashboard on port 3000 (default).

Options:
- `-p, --port <number>` - Specify port number
- `--no-browser` - Don't open browser automatically

### print
Generate a receipt from your current tasks.

Options:
- `-o, --output <format>` - Output format: html, console, or printer (default: console)
- `-p, --printer <interface>` - Printer interface for thermal printing

### config
Manage application configuration.

Options:
- `--show` - Display current configuration
- `--set <key=value>` - Set a configuration value
- `--reset` - Reset to defaults

## File Locations

- Database: `~/.todo-receipts/todos.db`
- Config: `~/.todo-receipts/config.json`
- Logo: `~/.todo-receipts/logo.png`
- Receipts: `~/.todo-receipts/receipts/`

## Troubleshooting

### Pi Zero 2 W Issues

The Pi Zero 2 W was attempted first but caused persistent problems:

- **WiFi drops during heavy operations** — the antenna is very weak and the single-core CPU pegs at 100% during `apt install`, which destabilizes the WiFi connection. The install would appear to hang or the Pi would drop off the network entirely.
- **Very slow package installation** — `apt install nodejs npm` installs hundreds of packages and takes 10+ minutes on the Zero 2 W. There is no good way to speed this up.
- **Repeated SD card reflashing** — multiple reflashes were required due to SSH connection failures and a corrupted SD card from a failed `apt upgrade`. Lesson: never run `apt upgrade` on a Pi during initial setup. Only install what you need.
- **SSH host key warnings** — every reflash changes the host key. Clear it with `ssh-keygen -R todo-printer.local` before reconnecting.
- **Raspberry Pi Imager saves credentials** — if you reflash and credentials stop working, open Imager and check what username/password are saved in the Customisation settings. They persist between sessions.

**Conclusion:** Use a Pi 3B or newer. The Zero 2 W is not worth the trouble for this use case.

### LIBUSB_ERROR_ACCESS

The polling agent can see the USB printer but cannot open it. Fix: add the udev rule described in the setup steps above and restart the service.

### Print Jobs Not Clearing

If the same job keeps retrying, check that `POST /api/print/:id/complete` is reachable from the Pi. The job is marked complete after a successful print. If the print fails, it stays pending and retries every 5 seconds.

### SSH: Host Key Changed Warning

After reflashing the SD card, run:

```bash
ssh-keygen -R todo-printer.local
ssh-keygen -R 192.168.x.x
```

Then reconnect.

### Printer Prints Blank or Faint Lines

Paper is loaded backwards. The heat-sensitive side must face the print head (inside of the roll). Flip the paper roll and try again.

### Mac Not Recognizing USB Printer

Use a data-capable USB cable. Charge-only cables will not work. If using USB-C, use an adapter — not all USB-C hubs expose USB data correctly.

## License

MIT

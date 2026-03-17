## 🚀 Quick Start

2. **Install prerequisites**  
   Ensure you have [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed:

```bash
node --version
npm --version
```

3. **Install dependencies**

```bash
npm i
```

4. **Start the development server**

```bash
npm run start
```

> **Note:**  
> The default dev server uses HTTP only, which is fine for desktop development.

---

## 🔒 Enabling HTTPS (for Mobile Testing)

Browsers block camera/microphone APIs over HTTP on non-localhost addresses. To test on mobile, enable HTTPS:

1. **Generate a self-signed certificate:**

```bash
# Run this command in Git Bash (or another terminal with OpenSSL support)
openssl req -new -x509 -sha256 -days 365 -nodes -out server.cert -keyout server.key
```

- Leave all fields blank if prompted.
- The certificate expires in 365 days; re-run the command to renew.

2. **Place certificate files in the project root:**

- `server.cert` — SSL certificate
- `server.key` — SSL private key

> **Note:**  
> Steps 1 and 2 only need to be done once per device.

3. **Start the HTTPS server:**

```bash
npm run start-https
```

> **Note:**  
> Browsers will always warn about self-signed certificate. Click "Advanced" → "Proceed" to continue.

---

## 📱 Testing on Mobile Devices

1. **Connect devices to the same network.**  
   Allow firewall access if prompted.

2. **Find your computer’s local IP address:**

```bash
ipconfig
```

Example output:

```
IPv4 Address. . . . . . . . . . . : 192.168.100.248
```

3. **Start the server:**

```bash
npm run start-https
# or, if not using HTTPS:
npm run start
```

4. **Access the site on your mobile browser:**  
   Replace `127.0.0.1` with your computer’s IPv4 address:

```
https://192.168.100.248:8080/index.html
```

> **Tip:**  
> Live reload works on mobile too!

---

## 🧪 Debugging Mobile Browsers

### iOS (Safari on iPhone)

**Requirements:**

- Mac computer
- Safari on both Mac and iPhone
- USB Lightning cable

**Steps:**

1. Enable Web Inspector:  
   `Settings > Safari > Advanced > Web Inspector → ON`
2. Connect iPhone to Mac via USB.
3. Enable Develop menu:  
   `Safari > Preferences > Advanced > Show Develop menu in menu bar`
4. Open your site on iPhone Safari.
5. On Mac Safari:  
   `Develop > [Your iPhone] > [Your Page]`

- Inspect DOM, network, JS, and view `console.log` output.

---

### Android (Chrome on Android)

**Requirements:**

- Chrome on both Android and desktop
- USB cable
- Developer mode enabled on Android

**Steps:**

1. Enable Developer Options:  
   `Settings > About Phone > Tap Build Number 7 times`
2. Enable USB Debugging:  
   `Settings > Developer Options > USB Debugging → ON`
3. Connect Android to your computer via USB.
4. Open your site in Chrome on Android.
5. On desktop Chrome, visit:  
   `chrome://inspect`
6. Select your device and click “Inspect”

- Full Chrome DevTools for your mobile browser, including live `console.log` output.

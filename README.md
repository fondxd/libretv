# 📺 LibreTV - Free Cloud Cinema & Streaming Platform

A lightweight, powerful, and private online video aggregation and streaming platform. Stream thousands of movies, TV series, anime, and live TV channels on any device (iPhone, iPad, Android, Smart TV, Mac, and Windows) with zero ads!

---

## 🚀 Two Ways to Run

### Option 1: 🌐 Host on Render (Access Anywhere, Even Away From Home)
Deploy for free on [Render.com](https://render.com) so you and your family can watch from any network on your phones or tablets.

1. **Create a GitHub Repository**:
   - Go to [https://github.com/new](https://github.com/new)
   - Repository name: **`libretv`**
   - Visibility: **Public** or **Private**
   - Leave "Add a README file" unchecked
   - Click **Create repository**

2. **Push Code to GitHub**:
   - Open Terminal and run:
     ```bash
     cd ~/Desktop/LibreTV
     ./push_to_github.sh
     ```
   - *Or manually via GitHub Web UI*: Click **Upload files** and drag the files in this folder into GitHub!

3. **Deploy on Render**:
   - Sign in to [https://dashboard.render.com](https://dashboard.render.com)
   - Click **New +** $\rightarrow$ **Web Service**
   - Select your **`libretv`** repository
   - Choose **Docker** as runtime (Render automatically selects this from the `Dockerfile`)
   - Select the **Free** instance plan
   - In **Environment Variables**, add:
     - `PASSWORD` = `admin123` *(or your custom secure password)*
     - `DEFAULT_RECOMMEND_SOURCE` = `douban`
   - Click **Deploy Web Service**!
   - Your live HTTPS URL (e.g., `https://libretv-xxxx.onrender.com`) will be live in 1–2 minutes!

---

### Option 2: 💻 Run Locally on This Mac (Home Wi-Fi Streaming)
You can start LibreTV directly on your Mac anytime:

- **Double-click** `Start LibreTV.command` on your Desktop!
- Or run in Terminal:
  ```bash
  cd ~/Desktop/LibreTV
  PASSWORD=admin123 PORT=8088 node server.js
  ```
- **Mac Browser**: [http://localhost:8088](http://localhost:8088)
- **Local Network (iPhone / iPad / Smart TV)**: `http://192.168.0.13:8088`
- **Default Password**: `admin123`

---

## 📱 How to Use on Mobile & Smart TV

### 🍏 iPhone / iPad
1. Open **Safari** and go to your Render URL or local URL (`http://192.168.0.13:8088`).
2. Enter your password (`admin123`).
3. Tap the **Share** button (box with arrow $\uparrow$) $\rightarrow$ **Add to Home Screen** ⊞.
4. Open the LibreTV icon on your home screen for a full-screen, native app experience!

### 📺 Smart TV (Samsung, LG, Google TV, Apple TV)
1. Open the TV's built-in **Web Browser**.
2. Enter your Render URL or local address (`http://192.168.0.13:8088`).
3. Enter password and start streaming movies or live TV directly on the big screen!

---

## 🎬 Video Sources & Subscriptions

LibreTV includes a pre-configured `sources.json` file with high-speed video sources:
* **暴风资源 (高速)**: `https://bfzyapi.com/api.php/provide/vod`
* **量子资源 (高清)**: `https://cj.lziapi.com/api.php/provide/vod`
* **非凡资源 (片源全)**: `http://cj.ffzyapi.com/api.php/provide/vod`
* **光速资源 (极速秒播)**: `https://api.guangsuapi.com/api.php/provide/vod`
* **iKun资源 (综合)**: `https://ikunzyapi.com/api.php/provide/vod`

### To Import or Add Sources in LibreTV:
1. Click the **⚙️ Settings (设置)** icon in LibreTV.
2. Go to **Source Management (源管理)** $\rightarrow$ **Data Source Subscriptions (数据源订阅)**.
3. Add your custom sources or TVBox compatible subscriptions!

# Proposal Moments

Guests scan a QR code, swipe up, and snap a photo or record a video (up to 3 minutes). Everything lands in a shared gallery, filed under the status that was live when it was taken.

- `/`: a phone lock screen with the couple's photos, their names and the **live status**. **Swipe up to snap**: the camera opens (photo or video) and the snap sends automatically. The latest snaps appear as notifications.
- `/memories`: everyone's snaps, grouped by category and refreshed every 10 seconds
- `/admin`: password-protected:
  - **Live status:** set what guests see (e.g. "Our forever begins" → "She said yes 💍"). Each status is also a category.
  - **Snaps:** browse them all, filter by category or guest, view full-screen, move a snap to another category, download one, delete.
  - **Downloads:** everything as a ZIP, with one folder per category in the order they happened.
  - **QR code:** the guest link to print or show on a screen.

**Categories follow the moment a photo was taken, not when it uploaded.** The server keeps a timeline of every status change and files each snap under the status that was live at that time. A snap taken offline during "Our forever begins" that uploads after you switch to "She said yes" stays in "Our forever begins".

**Videos upload in 4 MB pieces** and resume where they stopped if the connection drops, so a long video on weak Wi-Fi still gets through. The phone makes a preview frame, so videos show in the gallery with a ▶ badge and their length. The admin ZIP is built on the server and streamed, so it works however many videos there are.

**Works offline.** Every snap is saved on the guest's phone first and uploads in the background, retrying automatically when the connection returns, so nothing is lost on bad signal. After a guest's first visit, the site also opens without signal. This needs HTTPS, so it works on the live site but not when testing on `http://` over Wi-Fi.

Photos are stored in **Cloudflare R2**, or in the `.local-uploads` folder if R2 isn't configured. Names, categories and the status timeline are stored in **Postgres**.

## The couple's photos and names

Put photos of the couple in `public/couple/` (JPG, PNG or WebP; portrait photos look best). They become the lock-screen wallpaper and crossfade in name order (`1.jpg`, `2.jpg`, …). For each photo, set where the face is in `WALLPAPER_FIT` in `src/lib/event.ts` so it sits below the names. The names are in the same file. Rebuild after changing any of this (`npm run build`, then restart).

The status is not in the code. Change it from `/admin` while the event is running.

## Local setup

### 1. Cloudflare R2
1. In the Cloudflare dashboard, go to **R2 → Create bucket** (e.g. `proposal-moments`).
2. Open the bucket, go to **Settings → Public access**, and either enable the **r2.dev subdomain** or connect a custom domain. The resulting address is your `R2_PUBLIC_URL`.
3. Still under **Settings**, open **CORS policy** and add the policy below so the admin "Download all" button can fetch the photos:
   ```json
   [{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"] }]
   ```
   You can replace `*` with your site's address once it's live.
4. Go to **R2 → Manage R2 API Tokens → Create API token** with **Object Read & Write** permission for this bucket. Copy the Access Key ID and Secret Access Key.

### 2. Postgres
You'll need a Postgres database (version 13 or later) and its connection string. That becomes `DATABASE_URL`.

### 3. Configure and run
```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run db:setup             # creates/updates the tables (safe to run again)
npm run dev
```
Then open http://localhost:3000.

## Deploying to a VPS (Ubuntu)

These steps assume Ubuntu 22.04/24.04, a domain pointing at the server (an `A` record), and SSH access.

**1. Install Node.js 22, PM2, Nginx and Certbot**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

**2. Postgres** (skip if you already have one)
```bash
sudo apt install -y postgresql
sudo -u postgres psql -c "create user moments with password 'CHOOSE-A-PASSWORD';"
sudo -u postgres psql -c "create database proposal_moments owner moments;"
```
Your `DATABASE_URL` is then `postgres://moments:CHOOSE-A-PASSWORD@127.0.0.1:5432/proposal_moments`.

**3. Get the code onto the server and configure it**
```bash
cd /var/www && git clone <your-repo-url> proposal-moments && cd proposal-moments
# (or upload the folder with scp/rsync, without node_modules, .next and .env.local)
cp .env.example .env.local && nano .env.local   # DATABASE_URL, R2 keys, a strong ADMIN_PASSWORD
npm ci
npm run db:setup
npm run build
```

**4. Start it, and keep it running after reboots**
```bash
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup     # run the command it prints
```

**5. Nginx + HTTPS.** HTTPS is required for offline mode and for the camera to behave well on phones.
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/proposal-moments
sudo nano /etc/nginx/sites-available/proposal-moments      # set your domain
sudo ln -s /etc/nginx/sites-available/proposal-moments /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

**6. Final check.** Open `https://your-domain.com/admin`, sign in, check the live status, and download the QR code. It encodes the address you opened admin on, so download it from the live site.

**Updating later**
```bash
cd /var/www/proposal-moments && git pull && npm ci && npm run db:setup && npm run build && pm2 restart proposal-moments
```

**If you don't use R2:** leave the `R2_*` lines out of `.env.local` and photos and videos are saved in `.local-uploads/` on the server. Back that folder up after the event, and make sure the VPS has room: videos can be up to 500 MB each, though most phone clips are 20–100 MB per minute.

**Disk space for uploads in progress:** videos arrive in pieces under `.upload-pieces/` and are moved into storage when complete. Abandoned pieces are deleted after 48 hours.

## Note

The parent folder's name contains a `:`, which breaks the usual `npm` script setup. The scripts in `package.json` call Next.js directly to get around this. That works the same on the VPS.

---

Developed by [Abiolas Studio](https://techallowed.cloud)

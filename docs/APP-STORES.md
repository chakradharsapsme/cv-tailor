# Publishing Applywise to Google Play and the Apple App Store

Applywise is a Progressive Web App (PWA). It has a web app manifest, an offline service worker (`sw.js`), app icons (including maskable ones), store screenshots, a privacy policy (`privacy.html`) and terms (`terms.html`). So it can be wrapped as a store app without rewriting it. The store app loads the live site, so every update you push to GitHub reaches app users automatically, with no store resubmission.

## Before you start (one-off decisions)

1. **Web address.** The store app is tied to one web address. Today that's `https://chakradharsapsme.github.io/cv-tailor/`.
   - Google needs a file at `https://<domain>/.well-known/assetlinks.json`, at the root of the domain. A GitHub *project* site (`/cv-tailor/`) can't serve that path.
   - Pick one of these:
     - **Free:** create a second repository named exactly `chakradharsapsme.github.io`, and put `.well-known/assetlinks.json` in it (step 4 gives you the file). Also add an empty file named `.nojekyll` at its root, so GitHub serves the `.well-known` folder.
     - **Better, about £10/year:** buy a domain (for example `applywise.app`), point it at GitHub Pages or Cloudflare Pages, and serve the site from the root.
2. **Contact email.** Both stores require a support email and show it publicly. Decide which address to use. The privacy policy currently points to the GitHub issues page.
3. **Accounts, which only you can create:**
   - **Google Play Console:** a one-off US$25 fee, identity verification, and new personal accounts must run a closed test with at least 12 testers for 14 days before going public.
   - **Apple Developer Program:** US$99 a year, and you need a Mac with Xcode to upload.

## Google Play (Android)

1. Open **https://www.pwabuilder.com** and enter the site address. It checks the manifest, service worker and icons. Everything should be green.
2. Choose **Package for stores → Android → Google Play**.
   - Package ID: for example `app.applywise.twa`. Keep it forever.
   - App name: `Applywise`. Launcher name: `Applywise`.
   - Leave "signing key" as *Create new*. **Download and keep the signing key and its passwords safe.** You need them for every update.
3. Download the zip. It contains an `.aab` file (upload this to Play) and `assetlinks.json`.
4. Put that `assetlinks.json` at `https://<domain>/.well-known/assetlinks.json` (see "Web address" above). Without it, the app shows a browser address bar at the top.
5. In **Play Console**, create the app and fill in:
   - **Store listing:**
     - Short description: "Find jobs that fit your skills, tailor your CV and prepare for interviews."
     - Full description: take it from the manifest description, then expand it.
     - Graphics:
       - app icon: `assets/store/play-icon-512.png`
       - feature graphic: `assets/store/feature-graphic-1024x500.png`
       - phone screenshots: `assets/store/phone-*.png`
       - tablet screenshots: `assets/store/wide-*.png`
   - **Privacy policy URL:** `https://<site>/privacy.html`
   - **Data safety** (answer honestly):
     - The app does not collect data on a server.
     - Data is stored on the device.
     - Text is sent to the AI provider the user chooses, and search words are sent to job sources.
     - The user can delete all data in Settings.
   - **Content rating** questionnaire; **Target audience**: 18+.
   - **App category:** Business.
6. Upload the `.aab` to **Testing → Closed testing**, invite at least 12 testers for 14 days, then promote the app to Production.

## Apple App Store (iPhone and iPad)

1. In PWABuilder choose **Package for stores → iOS**. It produces an Xcode project.
2. Open it on a Mac with Xcode, set your team and bundle ID, then **Archive → Distribute → App Store Connect**.
3. In App Store Connect, add:
   - screenshots from an iPhone 6.7" and an iPad simulator
   - the privacy policy URL
   - the privacy "nutrition label": Data Not Collected, apart from what the user sends to their chosen AI provider.
4. Apple reviews web-wrapped apps strictly (guideline 4.2, minimum functionality).
   - Point out the offline mode, Word CV tailoring and interview practice in the review notes.
   - You don't need the store for iPhone users: they can install from Safari (Share → Add to Home Screen). The app shows them how.

## Microsoft Store (Windows): optional and free

PWABuilder → **Package for stores → Windows**. Upload the package in Partner Center. A developer account for individuals is free.

## After publishing

- Push changes to GitHub as usual. Installed apps pick them up. People see an "Update now" bar when a new version is ready.
- When you change `sw.js`, bump `VERSION` inside it so old offline copies are cleared.
- Keep the Play signing key backed up. Losing it means you can't update the app.

# Daily — Macros & Weight

## Publish with GitHub Pages

1. Unzip this download.
2. Create a public GitHub repository (for example, daily).
3. Choose Add file → Upload files. Upload the extracted files into the root of the repository. index.html must be at the top level, not inside another folder. Do not upload the ZIP itself.
4. Commit the files.
5. Open Settings → Pages.
6. Set Source to Deploy from a branch, choose main and / (root), and Save.
7. Wait for GitHub to publish and open the URL shown on the Pages settings screen.

No build step or dependencies are required. All app assets use relative paths, so a project URL such as https://YOUR-USERNAME.github.io/daily/ works.

## iPhone

Open your Pages URL in Safari, tap Share, and choose Add to Home Screen.

## Move existing data

At the old app address, open the small bottom-corner data menu and choose Export JSON. At the new address, choose Import data and select the backup. Logs do not automatically move between website addresses.

Each browser/device has its own saved data. Export backups periodically. Backups include macro entries, frequent meals, and weigh-ins. CSV export and import are supported too.

## Updates

Replace the app files in the same repository and commit. GitHub Pages republishes them. Refresh or reopen the app after deployment. Keep the same site address to retain the device's saved data.

## Optional cloud accounts

Optional account and offline sync support is prepared but remains disabled until a Supabase project is connected. See [CLOUD_SETUP.md](CLOUD_SETUP.md) for configuration, security, and live validation. Guest data remains local and export/import still works.

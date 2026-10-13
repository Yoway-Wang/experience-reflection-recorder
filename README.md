# Experience Reflection Recorder

A static, browser-based experience reflection recorder.

## Use Locally

Open `index.html` in a browser.

## Use In The Cloud

This project is ready for GitHub Pages.

1. Push this repository to GitHub.
2. Open the repository on GitHub.
3. Go to `Settings` > `Pages`.
4. Set `Source` to `GitHub Actions`.
5. Push to the `main` branch, or run the `Deploy to GitHub Pages` workflow manually.

After deployment, the app will be available at:

```text
https://yoway-wang.github.io/experience-reflection-recorder/
```

## Data Storage

Records are stored in the current browser's `localStorage` by default.

That means the hosted app can be opened from the cloud, and it still works offline in one browser.

## Optional Supabase Cloud Sync

The app also supports Supabase email login and per-user cloud sync.

1. Create a Supabase project.
2. In Supabase, open `SQL Editor`.
3. Run the SQL from `supabase-schema.sql`.
4. Go to `Project Settings` > `API`.
5. Copy the Project URL and anon public key.
6. Edit `cloud-config.js`:

```js
window.EXPERIENCE_RECORDER_CLOUD = {
  enabled: true,
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-PUBLIC-KEY"
};
```

7. Go to `Authentication` > `URL Configuration` in Supabase.
8. Add this site URL to the redirect URLs:

```text
https://yoway-wang.github.io/experience-reflection-recorder/
```

9. Push the updated `cloud-config.js` to GitHub.

After that, open the site, enter your email in `Cloud Sync`, and use the login link from Supabase. Records are merged by entry ID and latest update time.

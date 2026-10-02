# Social Media Profile Saver

A lightweight, browser-based app for saving and organizing social media profiles. Organize profiles by platform, topic, and subtopic, then search, reorder, export, or restore them when needed.

## Features

- **Platforms:** Start with common platforms or add your own.
- **Topics and subtopics:** Create nested categories and reorder them with priority selectors or drag and drop.
- **Saved profiles:** Store a name, username, link, notes, priority, and optional profile photo. Profile photos are kept in IndexedDB.
- **Profile lookup:** Paste a profile link to try to fetch its name, username, and photo. Results depend on the platform; some sites block browser requests.
- **Search:** Find profiles by name, username, URL, or notes.
- **Recycle Bin:** Move items out of the main view, restore them, or permanently delete them. Permanent deletion requires confirmation.
- **Import and export:** Back up app data as JSON and merge or replace data from a backup.
- **Dark interface:** Responsive layout with a dark color theme.
- **Local-first storage:** App data stays in the current browser profile; there is no account or app server.

## Getting started

There is no build step or package installation.

1. Download or clone this repository.
2. Open `index.html` in a modern browser.
3. Choose whether to load the sample data when prompted.

For more consistent browser storage and profile lookups, serve the folder locally. For example, with Python installed, run this command from the project directory:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Using the app

### Organize profiles

1. Select a platform tab, or add a custom platform with the `+` control.
2. Select **Add Topic** in the header and create a topic.
3. Add a subtopic inside the topic.
4. Select **Add Profile** or **Paste Link** in a subtopic, enter the profile details, and save.

Use the numbered priority selectors to move topics, subtopics, and profiles within their group. Priorities are reordered when an item is moved or deleted. Select a profile card to open its details, edit it, or move it to the Recycle Bin.

### Search, backup, and restore

- Type in the search field to find matching profiles.
- Select **Export** to download a JSON backup.
- Select **Import** to merge a backup with current data or replace current data.
- Open **Recycle Bin** at the bottom of the page to restore items or permanently remove them.

## Data and privacy

Platforms, topics, subtopics, profiles, and Recycle Bin entries are saved in browser local storage. Uploaded profile photos are stored separately in IndexedDB. This data is tied to the browser and origin used to open the app; it is not synchronized across browsers or devices. Export backups regularly if you need to preserve or transfer your data. Clearing browser site data can remove the app's saved data.

Profile lookup makes best-effort requests to external profile pages or metadata services. It may not work for platforms that block cross-origin browser requests. You can still enter profile details manually.

## Project files

- `index.html` - app layout and dialogs
- `style.css` - layout and dark theme
- `script.js` - core app behavior and data storage
- `repairs.js` - additional UI workflows and safeguards

The page loads `script.js` before `repairs.js`; keep that order if you change the script tags.

## Troubleshooting

- **Data is missing:** Check that you opened the app in the same browser and origin as before. Import a JSON backup if available.
- **Profile lookup fails:** The platform may block requests from the browser. Enter the profile information manually.
- **A photo does not appear:** Try uploading the image from your device; externally hosted images can block access or expire.

## License

See [LICENSE](LICENSE).

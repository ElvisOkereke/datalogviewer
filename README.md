# DataLogViewer

Free, fast datalog viewer for CSV logs, right in your browser.

**Open it:** https://elvisokereke.github.io/datalogviewer/

- **Private.** Your log files never leave your computer: no server, no account, no tracking.
- **Fast.** Large logs are parsed in the background; a 1,000,000-row file loads in about two seconds.
- **Forgiving.** Handles comma, semicolon and tab files, decimal commas, units rows, preambles and messy spreadsheet exports.

> **Status:** v0.1 in development. Charts, the channel list and the table view land next.

## Roadmap

- **v0.1, solid viewer:** synced multi-chart crosshair, zoom and pan, channel search, table view, themes.
- **v0.2, analyst:** calculated channels, scatter plots, range stats, markers, export.
- **v0.3+, MegaLogViewer rival:** RPM × MAP tables, log comparison, filters, more formats, offline install.

## Feedback

Found a file it can't read? [Open an issue](https://github.com/ElvisOkereke/datalogviewer/issues).

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # http://localhost:5173/datalogviewer/
npm test           # unit tests
npm run test:e2e   # end-to-end tests (builds first)
npm run sample     # regenerate public/samples/demo-run.csv
```

The original Flutter prototype is preserved at the `flutter-prototype` tag.

Free to use. © 2026 Elvis Okereke.

# schedule.frameone.net

A tournament schedule viewer for fighting game events. Displays multi-day, multi-stream schedules in a visual grid with timezone conversion for viewers worldwide.

## Adding a New Event

1. Create a new folder for your event under `/data`. Create a JSON file with your event data. See the fields below for reference.

2. Open a pull request with your changes. The `validate-json` workflow will check your JSON for syntax errors.

3. Wait for your PR to be reviewed and merged. Once merged, your event will be available on the site.

## JSON Structure

```json
{
  "eventName": "Event Name",
  "logo": "data/your-event-name/logo.png",
  "hidden": false,
  "weight": 0,
  "footerText": "EXAMPLE.COM/SCHEDULE",
  "timezone": "America/New_York",
  "days": [
    {
      "date": "2025-01-01",
      "startTime": "2025-01-01T10:00:00-05:00",
      "endTime": "2025-01-01T22:00:00-05:00",
      "streams": [
        {
          "name": "StreamName",
          "platform": "twitch.tv",
          "logo": "img/stream-logo.png",
          "events": [
            {
              "game": "Game Title",
              "icon": "img/game-icon.png",
              "phase": "Pools",
              "start": "2025-01-01T10:00:00-05:00",
              "end": "2025-01-01T18:00:00-05:00",
              "color": "#7bc67e"
            }
          ]
        }
      ]
    }
  ]
}
```

### Top-Level Fields

| Field | Required | Description |
|-------|----------|-------------|
| `eventName` | Yes | Display name for the event |
| `logo` | No | Path to the event logo shown in the header |
| `hidden` | No | Set to `true` to hide the event from the dropdown |
| `weight` | No | Tie-breaker for default selection when multiple events overlap (higher = priority) |
| `footerText` | No | Text displayed in the footer |
| `timezone` | Yes | IANA timezone identifier for the event (e.g. `America/Chicago`) |

### Day Fields

| Field | Required | Description |
|-------|----------|-------------|
| `date` | Yes | Date in `YYYY-MM-DD` format |
| `startTime` | Yes | Day start time in ISO 8601 with UTC offset |
| `endTime` | Yes | Day end time in ISO 8601 with UTC offset |
| `streams` | Yes | Array of stream objects |

### Stream Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Stream channel name |
| `platform` | Yes | `twitch.tv` or `youtube.com` |
| `logo` | No | Custom stream icon. Defaults to platform icon if not set |
| `events` | Yes | Array of event objects |

### Event Fields

| Field | Required | Description |
|-------|----------|-------------|
| `game` | Yes | Game title |
| `icon` | No | Path to game icon image |
| `phase` | Yes | Tournament phase (e.g. `Pools`, `Top 8`, `Grand Finals`) |
| `start` | Yes | Start time in ISO 8601 with UTC offset |
| `end` | Yes | End time in ISO 8601 with UTC offset |
| `color` | Yes | Hex color for the event block |

### Notes

- All times must include the UTC offset matching the event timezone (e.g. `-05:00` for EST, `-06:00` for CST)
- Events support half-hour precision (e.g. `T13:30:00`)
- `endTime` can extend past midnight into the next day (e.g. `2025-01-25T00:00:00-06:00` for a Friday schedule ending at midnight)
- You can include new logos for games and streams if needed in the `img` folder. The reccommended size for game icons is 64 pixels in height and a flexible width, and stream logos should be around 64x64 pixels.
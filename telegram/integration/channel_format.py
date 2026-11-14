"""The user's saved Daneshyar channel format. Pure rendering; never publishes."""
import json
from pathlib import Path

CONFIG_FILE = Path(__file__).resolve().parents[1] / "channel-format.json"
CONFIG = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
DIVIDER = CONFIG["divider"]
FOOTER = DIVIDER + "\n" + "\n".join(CONFIG["footer_lines"])
TIMESTAMP_SPACER = CONFIG["timestamp_spacer"]


def format_post(body: str, hashtags: str | list[str] = ()) -> str:
    """Format plain text or Telegram HTML, adding common and topic hashtags once."""
    supplied = hashtags.split() if isinstance(hashtags, str) else hashtags
    tags = list(dict.fromkeys([*CONFIG["common_hashtags"], *supplied]))
    if not body.strip() or any(not tag.startswith("#") or any(c.isspace() for c in tag) for tag in tags):
        raise ValueError("A post body and valid hashtags are required")
    return body.strip() + "\n\n" + " ".join(tags) + "\n\n" + FOOTER + TIMESTAMP_SPACER

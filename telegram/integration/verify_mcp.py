"""Read-only smoke test of the real MCP process and its configured account."""
import asyncio
import json
from pathlib import Path
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    params = StdioServerParameters(command=sys.executable,
                                  args=[str(Path(__file__).with_name("server.py"))])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            catalog = await session.list_tools()
            expected = {"telegram_status", "telegram_list_chats", "telegram_read_messages",
                        "telegram_send_message", "telegram_get_profile", "telegram_update_profile",
                        "telegram_set_profile_photo", "telegram_wait_for_messages"}
            assert {tool.name for tool in catalog.tools} == expected
            for tool in catalog.tools:
                assert tool.annotations is not None
                assert tool.annotations.readOnlyHint == (tool.name not in {
                    "telegram_send_message", "telegram_update_profile", "telegram_set_profile_photo"})
            status = await session.call_tool("telegram_status", {})
            status_data = status.structuredContent
            if status_data is None:
                status_data = json.loads(next(item.text for item in status.content if item.type == "text"))
            assert isinstance(status_data, dict)
            assert isinstance(status_data.get("configured"), bool)
            print(json.dumps({"mcp_protocol": "ok", "tool_count": len(catalog.tools),
                              "status_is_error": bool(status.isError),
                              "status": status_data}, ensure_ascii=True))
            if status.isError:
                raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())

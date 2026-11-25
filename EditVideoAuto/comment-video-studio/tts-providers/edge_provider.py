#!/usr/bin/env python3
import argparse
import asyncio
import json
import os

import edge_tts


async def list_voices() -> None:
    voices = await edge_tts.list_voices()
    result = [
        {
            "id": voice["ShortName"],
            "name": voice.get("FriendlyName", voice["ShortName"]),
            "locale": voice.get("Locale", ""),
            "gender": voice.get("Gender", ""),
        }
        for voice in voices
    ]
    print(json.dumps(result, ensure_ascii=False))


async def generate(args: argparse.Namespace) -> None:
    last_error = None
    for attempt in range(2):
        communicate = edge_tts.Communicate(
            text=args.text,
            voice=args.voice,
            rate=args.rate,
            pitch=args.pitch,
        )
        try:
            await asyncio.wait_for(communicate.save(args.output), timeout=25)
            if os.path.exists(args.output) and os.path.getsize(args.output) > 0:
                return
            last_error = RuntimeError("dịch vụ trả về file audio rỗng")
        except Exception as error:  # edge-tts có thể timeout hoặc đóng kết nối WebSocket
            last_error = error
        if os.path.exists(args.output):
            os.unlink(args.output)
        if attempt < 1:
            await asyncio.sleep(1 + attempt)
    raise RuntimeError(
        "Edge TTS không phản hồi sau 2 lần thử. Ứng dụng sẽ thử chuyển sang Giọng đọc macOS. "
        f"Chi tiết: {last_error}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Edge TTS bridge for COMMENT VIDEO STUDIO")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("voices")
    generate_parser = subparsers.add_parser("generate")
    generate_parser.add_argument("--voice", required=True)
    generate_parser.add_argument("--rate", required=True)
    generate_parser.add_argument("--pitch", required=True)
    generate_parser.add_argument("--output", required=True)
    generate_parser.add_argument("--text", required=True)
    args = parser.parse_args()
    asyncio.run(list_voices() if args.command == "voices" else generate(args))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Check AdminShell.tsx for hidden characters."""
path = "frontend/src/components/layout/AdminShell.tsx"
with open(path, "rb") as f:
    content = f.read()

# Check for BOM
if content[:3] == b'\xef\xbb\xbf':
    print("WARNING: File has UTF-8 BOM!")
else:
    print("No BOM detected")

# Check for other hidden characters
for i, byte in enumerate(content):
    if byte > 127 and byte not in [0xc2, 0xc3, 0xe2, 0xe3, 0xef]:  # UTF-8 continuation bytes
        # Find the line number
        line = content[:i].count(b'\n') + 1
        print(f"Unexpected byte 0x{byte:02x} at position {i}, line {line}")

# Check for form feed, vertical tab, etc
for i, byte in enumerate(content):
    if byte in [0x0b, 0x0c]:  # vertical tab, form feed
        line = content[:i].count(b'\n') + 1
        print(f"Control character 0x{byte:02x} at position {i}, line {line}")

print("Done")

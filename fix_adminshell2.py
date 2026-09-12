#!/usr/bin/env python3
"""Fix AdminShell.tsx malformed template literal."""
path = "frontend/src/components/layout/AdminShell.tsx"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Show lines around the problem area
for i in range(106, 115):
    line = lines[i]
    print(f"Line {i+1}: {repr(line)}")

# Find and fix the broken className
for i, line in enumerate(lines):
    if 'className={`' in line and 'fixed inset-y-0' in line and not line.rstrip().endswith('`}'):
        print(f"\nFound broken className at line {i+1}")
        print(f"Before: {repr(line)}")
        lines[i] = line.rstrip()[:-1] + '`}\n'
        print(f"After: {repr(lines[i])}")
        break

with open(path, "w", encoding="utf-8") as f:
    f.writelines(lines)
print("\nDone")

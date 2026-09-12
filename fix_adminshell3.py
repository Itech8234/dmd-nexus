#!/usr/bin/env python3
"""Fix AdminShell.tsx - remove form feed character in className."""
path = "frontend/src/components/layout/AdminShell.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the broken className with the correct one
old = 'className={\x0cixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-surface-line bg-white shadow-pop transition-transform duration-300 }'
new = 'className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-surface-line bg-white shadow-pop transition-transform duration-300 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}'

if old in content:
    content = content.replace(old, new)
    print("Fixed the broken className")
else:
    print("Pattern not found, trying alternative...")
    # Try to fix any line with form feed
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if '\x0c' in line and 'className=' in line:
            print(f"Found form feed on line {i+1}: {repr(line)}")
            lines[i] = '        className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-surface-line bg-white shadow-pop transition-transform duration-300 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}'
            print(f"Fixed line {i+1}")
            break
    content = '\n'.join(lines)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")

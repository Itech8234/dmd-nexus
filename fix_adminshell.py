#!/usr/bin/env python3
"""Fix AdminShell.tsx malformed template literal."""
import sys

path = "frontend/src/components/layout/AdminShell.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Find the broken className and fix it
# The issue: className={`... } instead of className={`...`}
old = 'className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-surface-line bg-white shadow-pop transition-transform duration-300 }'
new = 'className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-surface-line bg-white shadow-pop transition-transform duration-300 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}'

# Try to find the broken pattern
lines = content.split('\n')
for i, line in enumerate(lines):
    if 'className={`fixed' in line and line.rstrip().endswith('}'):
        # This line has the broken pattern - missing closing backtick before }
        lines[i] = line.rstrip()[:-1] + '`}'
        print(f"Fixed line {i+1}")
        break
    elif 'className={' in line and '`fixed' in line:
        # Another variant
        lines[i] = '        className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-surface-line bg-white shadow-pop transition-transform duration-300 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}'
        print(f"Fixed line {i+1}")
        break

content = '\n'.join(lines)
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")

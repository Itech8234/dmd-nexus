#!/usr/bin/env python3
"""Remove all form feed characters from AdminShell.tsx and fix classNames."""
path = "frontend/src/components/layout/AdminShell.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace form feed + backtick with just backtick
# The pattern is: className={\xffixed (form feed instead of backtick)
# We need to find all occurrences and fix them

import re

# Find lines with form feed character and fix them
lines = content.split('\n')
fixed = []
for i, line in enumerate(lines):
    if '\x0c' in line:
        print(f"Line {i+1} has form feed: {repr(line[:80])}")
        # Replace form feed with backtick
        line = line.replace('\x0c', '`')
        # Check if the line ends with just a closing brace (missing closing backtick)
        if line.rstrip().endswith(' }') and not line.rstrip().endswith('`}'):
            line = line.rstrip()[:-1] + '`}'
            print(f"  Fixed: added closing backtick")
        fixed.append(line)
    else:
        fixed.append(line)

content = '\n'.join(fixed)
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")

import pypdf

reader = pypdf.PdfReader("SolisCloud Platform API Document V2.0.3.pdf")
print("Total pages:", len(reader.pages))

# Search for "2129"
found = []
for i, page in enumerate(reader.pages):
    text = page.extract_text()
    if "2129" in text:
        found.append(i + 1)
print("Pages containing '2129':", found)

# Let's search for "alarmCode" or similar keyword to see where alarms are discussed
alarm_pages = []
for i, page in enumerate(reader.pages):
    text = page.extract_text()
    if "alarm" in text.lower() or "fault" in text.lower():
        alarm_pages.append(i + 1)
print("Pages containing 'alarm' or 'fault':", len(alarm_pages))

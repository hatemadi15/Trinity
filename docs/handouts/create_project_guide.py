"""Create the editable beginner's guide using standard Word Open XML only."""
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED
import json

ROOT = Path(__file__).resolve().parent
PAGES = [
    ('Earthrise', 'Choosing a place and a date to land on the Moon', [
        ('lead', 'Earthrise helps you compare lunar landing plans. It shows when a lander has sunlight, how long it keeps power, and when Earth is visible.'),
        ('h', 'Why we built it'),
        ('p', 'A lander is a spacecraft that reaches the ground. Solar-powered landers need sunlight to make electricity. When the Sun disappears, they use a battery. They also need a clear view toward Earth to send information directly home.'),
        ('p', 'Near the Moon’s south pole, the Sun stays low. Hills can block it for days. Moving a short distance or landing a week later can change the result. Earthrise lets you check those changes in one place.'),
        ('h', 'The three numbers to look at first'),
        ('term', 'How long does the power last?', 'The hours from landing until the first time the panel and battery cannot supply enough electricity. This includes time running on the battery, not just time in sunlight.'),
        ('term', 'When is Earth visible while we have power?', 'The total hours when both conditions happen together. Earth appearing after the lander loses power does not count. These hours may be spread across several separate periods.'),
        ('term', 'How long does Earth stay hidden?', 'The longest uninterrupted stretch without a view of Earth during the full forecast. A plan can have plenty of Earth-visible hours overall and still have a long gap.'),
        ('h', 'What a one-week delay changes'),
        ('p', 'This example uses the same lander for three 30-day forecasts. It has a 4 m² panel, uses 200 watts and starts with a full 2 kWh battery. Arrivals are at midnight UTC in January 2027. The nearby summit is about 12 km away.'),
        ('table', ['Landing plan', 'Power lasts', 'Earth visible while powered', 'Longest time Earth is hidden'], [
            ['Original point: 1 January', '3 days, 4 hours', 'None', '9 days, 3 hours'],
            ['Same point: 8 January', '10 hours', 'None', '13 days, 17 hours'],
            ['Nearby summit: 8 January', 'All 30 days', '15 days, 12 hours', '12 days, 13 hours'],
        ]),
        ('p', 'The delayed arrival runs on its battery for just 10 hours. The summit keeps power for the whole forecast, but Earth is still hidden for long stretches. Whether that is acceptable depends on the mission.'),
        ('h', 'Where the numbers come from'),
        ('bullet', 'The ground: NASA’s LRO/LOLA height maps show the hills around each point. The app checks what they block, including the Moon’s curved surface.'),
        ('bullet', 'The sky: JPL DE440 position data, prepared with NASA’s SPICE tools, tell us where the Sun and Earth are at each time.'),
        ('bullet', 'The battery: the app works out how much electricity the panel makes and the lander uses, then updates the battery hour by hour. For example, a full 2 kWh battery supplying 200 W lasts 10 hours without solar power.'),
        ('note', 'These are estimates. Seeing Earth does not guarantee a working radio link. The app does not predict whether a lander survives extreme cold or restarts after losing power. Some region locations are approximate, and terrain uncertainty can shift the event times.'),
    ]),
    ('What you can do in the app', 'The features, and how they answer the challenge', [
        ('p', 'The challenge asks for an easy way to compare landing places and dates using sunlight and Earth visibility. Here is where each of its seven suggested feature areas appears in Earthrise.'),
        ('table', ['The challenge asks for…', 'Earthrise lets you…'], [
            ['Choose and compare locations', 'Pick from 19 locations or enter a point south of 60° S. Compare up to four sites with the same settings, or save up to six separate plans with their own dates and landers.'],
            ['Change dates and times', 'Choose the arrival date and UTC hour, then look ahead 14, 30 or 90 days. Keep the original plan beside a delayed arrival or a nearby alternative. Position data cover 2024–2036.'],
            ['See the Sun and Earth against the horizon', 'See their paths against the surrounding hills. Check the horizon chart and timeline to find when the Sun or Earth goes out of view.'],
            ['Assess power and communication opportunities', 'Check the battery, hours with power, Earth-visible hours and longest gaps. Set the operating time and Earth visibility you need; see which plans meet those needs and why others do not.'],
            ['Use different views', 'Switch between a shadow map, 3D ground and horizon chart. “Stand on the Moon” shows the view from the site, including the Sun, Earth and stars.'],
            ['Watch conditions change over time', 'Move the time bar or press Play. Follow the shadows, Sun, Earth and battery together. Markers highlight important changes.'],
            ['Help beginners and experienced users', 'Start with a short answer, then open the detailed numbers. “How it works” explains the science. The layout works on phones and computers, with light and dark themes and simpler graphics when needed.'],
        ]),
        ('h', 'A few other useful features'),
        ('bullet', 'Find another arrival: search the next 12 months for a better sampled date. The search checks six-hour steps, favouring longer powered operation, then Earth visibility while powered. Across several sites, it first compares average powered time.'),
        ('bullet', 'See dates side by side: a grid compares three locations at seven weekly arrivals. Open a cell to see its forecast.'),
        ('bullet', 'Try a different lander: choose an example or change the panel, battery and electricity use. Compare mast heights to see how the view over the hills changes.'),
        ('bullet', 'Ask in plain words: the assistant can select sites or change settings for you. The calculation engine supplies the numbers, not the AI.'),
        ('bullet', 'Share the plan: save it in your browser, send a link with its settings, or print a comparison. A one-page brief is available for a single forecast.'),
        ('bullet', 'Check the evidence: the Accuracy page shows comparisons with JPL Horizons and published LOLA sunlight maps. It also compares predicted sunsets with real mission endings, with explanations of their limits.'),
        ('p', 'The home page introduces the project with a flight to the south pole. Moon and Earth imagery use NASA’s CGI Moon Kit and Blue Marble. Large terrain shapes come from data; decorative rocks and small craters are illustrations. Forecasts work offline when the app and data are stored locally. Live AI and the live Horizons check need internet.'),
        ('h', 'A few terms you will see'),
        ('p', 'CLPS: NASA’s Commercial Lunar Payload Services, which buys deliveries to the Moon from companies. Terrain: the shape of the ground. Horizon: the skyline around you. Elevation: how high the Sun or Earth appears above the local horizontal. Ephemeris: positions in space over time. UTC: the shared time standard used for arrivals. W measures power; Wh or kWh measures stored energy.'),
        ('links', [
            ('NASA LRO/LOLA', 'https://science.nasa.gov/mission/lro/lola/'),
            ('JPL DE440', 'https://ssd.jpl.nasa.gov/planets/eph_export.html'),
            ('JPL Horizons', 'https://ssd.jpl.nasa.gov/horizons/'),
            ('LOLA sunlight maps', 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/'),
        ]),
        ('p', 'Built by Team Astroy/Ed for NASA Space Apps 2026. Earthrise uses NASA data but is not an official NASA product. It helps with early comparisons and learning; it is not a complete mission safety check.'),
    ]),
]

NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
def run(text, bold=False):
    return '<w:r>' + ('<w:rPr><w:b/></w:rPr>' if bold else '') + '<w:t xml:space="preserve">' + escape(text) + '</w:t></w:r>'

def para(text='', style='Normal', bold_prefix=None):
    content = run(text)
    if bold_prefix:
        content = run(bold_prefix + ' — ', True) + run(text)
    return f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr>{content}</w:p>'

def table(headers, rows):
    widths = [2850, 7056] if len(headers) == 2 else [3300, 1800, 2350, 2456]
    def cell(text, width, header=False):
        fill = '<w:shd w:val="clear" w:fill="E8F0F5"/>' if header else ''
        return f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{fill}</w:tcPr>' + para(text, 'TableHeader' if header else 'TableText') + '</w:tc>'
    body = '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + ''.join(cell(text, width, True) for text, width in zip(headers, widths)) + '</w:tr>'
    for row in rows:
        body += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + ''.join(cell(text, width) for text, width in zip(row, widths)) + '</w:tr>'
    return '<w:tbl><w:tblPr><w:tblW w:w="9906" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5DD"/><w:bottom w:val="single" w:sz="4" w:color="CBD5DD"/><w:insideH w:val="single" w:sz="4" w:color="CBD5DD"/><w:insideV w:val="single" w:sz="4" w:color="CBD5DD"/></w:tblBorders><w:tblCellMar><w:top w:w="65" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="65" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + ''.join(f'<w:gridCol w:w="{width}"/>' for width in widths) + '</w:tblGrid>' + body + '</w:tbl>'

rels = [('rId1', 'styles', 'styles.xml'), ('rId2', 'footer', 'footer1.xml')]
paragraphs = []
for page_no, (title, subtitle, items) in enumerate(PAGES, 1):
    if page_no > 1:
        paragraphs.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    paragraphs.append(para(f'EARTHRISE  /  PROJECT BRIEF  /  {page_no:02}', 'Eyebrow'))
    paragraphs.append(para(title, 'Title'))
    paragraphs.append(para(subtitle, 'Subtitle'))
    for item in items:
        kind, text, *extra = item
        if kind == 'links':
            links = []
            for label, target in text:
                rid = f'rId{len(rels)+1}'
                rels.append((rid, 'hyperlink', target))
                links.append(f'<w:hyperlink r:id="{rid}"><w:r><w:rPr><w:color w:val="235A81"/><w:u w:val="single"/></w:rPr><w:t>{escape(label)}</w:t></w:r></w:hyperlink>')
            paragraphs.append('<w:p><w:pPr><w:pStyle w:val="Source"/></w:pPr>' + run('Sources: ') + run(' | ').join(links) + '</w:p>')
        elif kind == 'link':
            rid = f'rId{len(rels)+1}'
            rels.append((rid, 'hyperlink', extra[0]))
            paragraphs.append(f'<w:p><w:pPr><w:pStyle w:val="Source"/></w:pPr><w:hyperlink r:id="{rid}"><w:r><w:rPr><w:color w:val="235A81"/><w:u w:val="single"/></w:rPr><w:t>{escape(text)}</w:t></w:r></w:hyperlink></w:p>')
        elif kind == 'table':
            paragraphs.append(table(text, extra[0]))
        elif kind == 'term':
            paragraphs.append(para(extra[0], 'Glossary', text))
        else:
            paragraphs.append(para(('•  ' if kind == 'bullet' else '') + text, {'h':'Heading1', 'lead':'Lead', 'note':'Note'}.get(kind, 'Normal')))

styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="%s">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/><w:color w:val="243340"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="75" w:line="240" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Eyebrow"><w:name w:val="Eyebrow"/><w:pPr><w:spacing w:before="0" w:after="100"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="386881"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="100"/><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="142E42"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:spacing w:after="140"/><w:keepNext/></w:pPr><w:rPr><w:sz w:val="21"/><w:color w:val="526570"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:spacing w:before="100" w:after="50"/><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/><w:color w:val="142E42"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Lead"><w:name w:val="Lead"/><w:pPr><w:spacing w:after="180"/></w:pPr><w:rPr><w:sz w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:pPr><w:spacing w:before="120" w:after="110"/><w:shd w:val="clear" w:fill="EDF3F6"/><w:pBdr><w:left w:val="single" w:sz="16" w:space="8" w:color="386881"/></w:pBdr></w:pPr><w:rPr><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Source"><w:name w:val="Source"/><w:pPr><w:spacing w:after="70"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Glossary"><w:name w:val="Glossary"/><w:pPr><w:spacing w:after="70" w:line="240" w:lineRule="auto"/><w:keepLines/></w:pPr><w:rPr><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:pPr><w:spacing w:after="0" w:line="220" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="19"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="TableText"/><w:rPr><w:b/><w:sz w:val="19"/></w:rPr></w:style></w:styles>''' % NS
document = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{NS}" xmlns:r="{RNS}"><w:body>{''.join(paragraphs)}<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="1000" w:bottom="850" w:left="1000" w:header="350" w:footer="350"/></w:sectPr></w:body></w:document>'''
footer = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="{NS}"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="687A85"/></w:rPr><w:t xml:space="preserve">Earthrise • Team Astroy/Ed  |  </w:t></w:r><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>'''
relationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(f'<Relationship Id="{rid}" Type="{RNS}/{kind}" Target="{escape(target, {chr(34): "&quot;"})}"' + (' TargetMode="External"' if kind == 'hyperlink' else '') + '/>' for rid,kind,target in rels) + '</Relationships>'
content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'''
package_rels = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{RNS}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'''
core = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Earthrise — A Guide to the Project</dc:title><dc:subject>What Earthrise does, how its three main numbers work and where to find each feature</dc:subject><dc:creator>Team Astroy/Ed</dc:creator><dc:language>en</dc:language></cp:coreProperties>'''
output = ROOT / 'Earthrise_Project_Guide_Revised.docx'
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name, value in {'[Content_Types].xml': content_types, '_rels/.rels': package_rels, 'word/document.xml': document, 'word/styles.xml': styles, 'word/footer1.xml': footer, 'word/_rels/document.xml.rels': relationships, 'docProps/core.xml': core}.items():
        archive.writestr(name, value)

# A readable companion makes later wording edits easy without opening Word.
markdown = []
for title, subtitle, items in PAGES:
    markdown += ['# ' + title, '', subtitle, '']
    for kind, text, *extra in items:
        if kind == 'links': line = 'Sources: ' + ' | '.join(f'[{label}]({target})' for label, target in text)
        elif kind == 'link': line = f'[{text}]({extra[0]})'
        elif kind == 'table':
            line = '| ' + ' | '.join(text) + ' |\n| ' + ' | '.join(['---'] * len(text)) + ' |\n' + '\n'.join('| ' + ' | '.join(row) + ' |' for row in extra[0])
        elif kind == 'term': line = f'**{text}** — {extra[0]}'
        else: line = ('## ' if kind == 'h' else '- ' if kind == 'bullet' else '') + text
        markdown += [line, '']
(ROOT / 'Earthrise_Simple_Project_Guide.md').write_text('\n'.join(markdown))
(ROOT / 'Earthrise_Project_Overview_and_Challenge_Coverage.md').write_text('\n'.join(markdown))
(ROOT / 'Earthrise_Simple_Project_Guide.docx').write_bytes(output.read_bytes())
(ROOT / 'Earthrise_Project_Overview_and_Challenge_Coverage.docx').write_bytes(output.read_bytes())
(ROOT / 'Earthrise_Project_Guide_Revised.md').write_text('\n'.join(markdown))
print(json.dumps({'document': str(output), 'sections': len(PAGES), 'words': len(' '.join(markdown).split())}))

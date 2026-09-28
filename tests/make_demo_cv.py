"""Builds samples/demo-cv.docx: a fictional SAP procurement CV used for the demo
button and the automated test. It deliberately mixes the formatting the
engine has to survive: a letterhead with tabs, headings, a bold-label line,
bullet lists, a two-column skills table, header and footer."""
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
import sys

out = sys.argv[1] if len(sys.argv) > 1 else "samples/demo-cv.docx"
d = Document()
sec = d.sections[0]
sec.left_margin = sec.right_margin = Cm(2)
sec.top_margin = sec.bottom_margin = Cm(1.6)
st = d.styles["Normal"]; st.font.name = "Calibri"; st.font.size = Pt(10.5)
d.styles["Heading 1"].font.size = Pt(12); d.styles["Heading 1"].font.color.rgb = RGBColor(0x1F, 0x3A, 0x5F)
sec.footer.paragraphs[0].text = "Alex Morgan · CV · Fictional demo"

p = d.add_paragraph(); r = p.add_run("ALEX MORGAN"); r.bold = True; r.font.size = Pt(20); r.font.color.rgb = RGBColor(0x1F, 0x3A, 0x5F)
p = d.add_paragraph("Leeds, UK\t+44 7700 900123\talex.morgan@example.com\tlinkedin.com/in/alex-morgan-demo")
p.alignment = WD_ALIGN_PARAGRAPH.LEFT
p = d.add_paragraph(); r = p.add_run("Senior SAP Procurement Consultant | SAP Ariba · P2P · SAP MM"); r.italic = True

d.add_heading("Profile", level=1)
d.add_paragraph("SAP procurement consultant with 14 years of experience delivering purchasing and invoicing solutions for "
                "manufacturing and public-sector clients. Strong in SAP MM configuration and SAP Ariba Buying & Invoicing, "
                "with a record of leading workshops and working closely with finance teams.")

d.add_heading("Core skills", level=1)
t = d.add_table(rows=3, cols=2); t.style = "Table Grid"
cells = [("SAP Ariba", "Buying & Invoicing, Guided Buying, Sourcing, Contracts, Supplier Management"),
         ("SAP ERP", "SAP MM, S/4HANA Sourcing & Procurement, release strategies, pricing procedures"),
         ("Delivery", "Workshops, functional design, SIT/UAT, cutover, hypercare, PMP")]
for i, (a, b) in enumerate(cells):
    t.cell(i, 0).text = a; t.cell(i, 0).paragraphs[0].runs[0].bold = True
    t.cell(i, 1).text = b

d.add_heading("Experience", level=1)
p = d.add_paragraph(); r = p.add_run("Lead SAP Ariba Consultant"); r.bold = True; p.add_run(" · Brightwater Consulting (fictional) · 2019 – present")
p = d.add_paragraph(); r = p.add_run("Client: "); r.bold = True; p.add_run("UK water utility, Ariba Buying & Invoicing rollout to 4,000 users")
for b in ["Configured Guided Buying landing pages, forms and policies for indirect spend categories.",
          "Designed approval flows in SAP Ariba integrated with S/4HANA via Cloud Integration Gateway.",
          "Ran fit-to-standard workshops with procurement and accounts payable teams.",
          "Supported supplier enablement on SAP Business Network for 600 suppliers.",
          "Prepared training material and delivered sessions to super users."]:
    d.add_paragraph(b, style="List Bullet")

p = d.add_paragraph(); r = p.add_run("SAP MM Consultant"); r.bold = True; p.add_run(" · Northfield Systems (fictional) · 2012 – 2019")
for b in ["Configured SAP MM purchasing, release strategies and pricing for a global manufacturer.",
          "Led data migration of vendor master and open purchase orders for two plants.",
          "Wrote functional specifications for output forms and interfaces."]:
    d.add_paragraph(b, style="List Bullet")

d.add_heading("Education and certifications", level=1)
d.add_paragraph("BEng Mechanical Engineering, University of Leeds (fictional entry)")
d.add_paragraph("SAP Certified Associate – SAP Ariba Procurement; PMP")
d.save(out)
print("wrote", out)

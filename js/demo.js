/* demo.js — builds a small fictional Word CV in the browser so you can try Applywise without your own file. */
(function () {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const run = (t, o = {}) => `<w:r>${o.b || o.i || o.sz || o.color ? `<w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const para = (runs, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${runs}</w:p>`;
  const tabs = parts => `<w:r>${parts.map((t, i) => (i ? '<w:tab/>' : '') + `<w:t xml:space="preserve">${esc(t)}</w:t>`).join('')}</w:r>`;
  const cell = runs => `<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p>${runs}</w:p></w:tc>`;

  const CVS = {
    it: { headline: 'Senior SAP Procurement Consultant | SAP Ariba · P2P · SAP MM',
      profile: null, rows: [['SAP Ariba', 'Buying & Invoicing, Guided Buying, Sourcing, Contracts, Supplier Management'],
        ['SAP ERP', 'SAP MM, S/4HANA Sourcing & Procurement, release strategies, pricing procedures'],
        ['Delivery', 'Workshops, functional design, SIT/UAT, cutover, hypercare, PMP']],
      jobs: [['Lead SAP Ariba Consultant', ' · Brightwater Consulting (fictional) · 2019 – present', 'UK water utility, Ariba Buying & Invoicing rollout to 4,000 users',
        ['Configured Guided Buying landing pages, forms and policies for indirect spend categories.', 'Designed approval flows in SAP Ariba integrated with S/4HANA via Cloud Integration Gateway.',
          'Ran fit-to-standard workshops with procurement and accounts payable teams.', 'Supported supplier enablement on SAP Business Network for 600 suppliers.', 'Prepared training material and delivered sessions to super users.']],
        ['SAP MM Consultant', ' · Northfield Systems (fictional) · 2012 – 2019', '', ['Configured SAP MM purchasing, release strategies and pricing for a global manufacturer.',
          'Led data migration of vendor master and open purchase orders for two plants.', 'Wrote functional specifications for output forms and interfaces.']]],
      edu: ['BEng Mechanical Engineering, University of Leeds (fictional entry)', 'SAP Certified Associate – SAP Ariba Procurement; PMP'] },
    any: { headline: 'Customer Operations Team Leader | Coaching · Service quality · Process improvement',
      profile: 'Team leader with 8 years of experience in customer-facing operations. I lead teams of up to 12, keep service levels on target and turn complaints into process fixes. Confident with Excel, CRM systems and weekly KPI reporting.',
      rows: [['Leadership', 'Coaching, rotas and scheduling, one-to-ones, performance reviews, training new starters'],
        ['Operations', 'Service levels, KPI reporting, complaints handling, process improvement'], ['Tools', 'Excel, Zendesk, Salesforce, Microsoft Office']],
      jobs: [['Team Leader, Customer Operations', ' · Harbour Home Services (fictional) · 2020 – present', 'Contact centre handling 3,000 contacts a week',
        ['Lead a team of 11 advisors across phone, email and chat.', 'Raised first-contact resolution from 68% to 81% by rewriting the top 20 help articles.',
          'Cut complaint volumes by 30% by fixing the three most common billing issues with the finance team.', 'Train every new starter and run monthly one-to-ones.']],
        ['Senior Customer Service Advisor', ' · Northgate Retail (fictional) · 2016 – 2020', '', ['Handled escalated complaints and refunds.', 'Mentored 4 new advisors.', 'Kept a 95% quality score for three years.']]],
      edu: ['BA Business Studies, University of Leeds (fictional entry)', 'ILM Level 3 Certificate in Leadership and Management'] }
  };
  function documentXml(kind) {
    const v = CVS[kind] || CVS.any;
    const b = [];
    b.push(para(run('ALEX MORGAN', { b: 1, sz: 40, color: '1F3A5F' })));
    b.push(para(tabs(['Leeds, UK', '+44 7700 900123', 'alex.morgan@example.com', 'linkedin.com/in/alex-morgan-demo'])));
    b.push(para(run(v.headline, { i: 1 })));
    b.push(para(run('Profile'), 'Heading1'));
    b.push(para(run(v.profile || 'SAP procurement consultant with 14 years of experience delivering purchasing and invoicing solutions for manufacturing and public-sector clients. Strong in SAP MM configuration and SAP Ariba Buying & Invoicing, with a record of leading workshops and working closely with finance teams.')));
    b.push(para(run('Core skills'), 'Heading1'));
    const rows = v.rows;
    b.push(`<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2500"/><w:gridCol w:w="6500"/></w:tblGrid>${rows.map(r => `<w:tr>${cell(run(r[0], { b: 1 }))}${cell(run(r[1]))}</w:tr>`).join('')}</w:tbl>`);
    b.push(para(run('Experience'), 'Heading1'));
    v.jobs.forEach(([title, meta, client, bullets]) => {
      b.push(para(run(title, { b: 1 }) + run(meta)));
      if (client) b.push(para(run('Client: ', { b: 1 }) + run(client)));
      bullets.forEach(t => b.push(para(run(t), 'ListBullet')));
    });
    b.push(para(run('Education and certifications'), 'Heading1'));
    v.edu.forEach(t => b.push(para(run(t))));
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${b.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="907" w:right="1134" w:bottom="907" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="1F3A5F"/></w:pBdr></w:pPr><w:rPr><w:b/><w:color w:val="1F3A5F"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;

  /** Returns the demo CV as an ArrayBuffer. */
  async function demoCv(kind) {
    kind = kind || (window.CVT.fields && window.CVT.fields.current().id === 'it' ? 'it' : 'any');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.file('word/styles.xml', STYLES);
    zip.file('word/document.xml', documentXml(kind));
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  window.CVT = window.CVT || {};
  window.CVT.demoCv = demoCv;
})();

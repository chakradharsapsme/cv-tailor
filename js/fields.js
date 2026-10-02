/*
 * fields.js — the professions Applywise supports. Each field knows its skills vocabulary,
 * what its job titles look like, sensible starter searches and how the AI coach should speak.
 * The user's field comes from their profile (or is inferred from their titles and skills).
 */
(function () {
  // "Display|alias|alias". Short all-caps aliases match case-sensitively.
  const IT_LEXICON = [
    'SAP Ariba|Ariba', 'Ariba Buying|Ariba Buying and Invoicing|ABI', 'Guided Buying', 'Ariba Sourcing|Strategic Sourcing',
    'Ariba Contracts|Contract lifecycle management|CLM', 'SLP|Supplier Lifecycle and Performance|Supplier Lifecycle',
    'Supplier Risk', 'Ariba Network|SAP Business Network', 'Catalogues|Catalog|Catalogue|punchout|punch-out',
    'Spend Analysis|Spend visibility', 'CIG|Cloud Integration Gateway', 'SAP Integration Suite|CPI|Cloud Platform Integration',
    'SAP BTP|BTP|Business Technology Platform', 'S/4HANA|S4HANA|S/4 HANA|S4 HANA|S4',
    'S/4HANA Public Cloud|Public Cloud|GROW with SAP', 'RISE with SAP|RISE', 'Central Procurement',
    'SAP MM|Materials Management|MM', 'SAP SRM|SRM', 'SAP ECC|ECC', 'SAP FI/CO|FICO|FI/CO|SAP FI',
    'Source-to-Pay|S2P|Source to Pay', 'Procure-to-Pay|P2P|Procure to Pay|Purchase to Pay',
    'Invoice automation|Invoice Management|VIM|OpenText', 'GR/IR', 'UK VAT|VAT',
    'Vendor master|Supplier master|Business Partner|vendor onboarding|supplier onboarding', 'MDG|Master Data Governance',
    'SAP Fieldglass|Fieldglass', 'SAP Concur|Concur', 'Coupa', 'Jaggaer', 'Oracle Procurement|Oracle', 'Ivalua', 'Basware', 'Tungsten',
    'Signavio', 'Solution Manager|SolMan|Cloud ALM', 'SAP Activate|Activate methodology',
    'Fit-to-standard|fit to standard|fit-gap|fit gap', 'Global template', 'Data migration|Migration Cockpit|LTMC',
    'Cutover', 'SIT|System integration testing', 'UAT|User acceptance testing', 'Hypercare', 'Fiori', 'ABAP', 'IDoc|IDocs',
    'cXML', 'EDI', 'APIs|API', 'Approval workflow|Workflow', 'Agile|Scrum', 'PMP', 'PRINCE2',
    'Design authority', 'Solution architecture|Solution architect', 'Pre-sales|presales', 'Workshops', 'Business case',
    'Change management', 'Offshore delivery|offshore',
    'Procurement transformation', 'Category management', 'Sustainability|ESG', 'AI|Artificial intelligence|Joule|machine learning',
    'SAP Analytics Cloud|SAC', 'Power BI', 'Security clearance|SC clearance|SC cleared|DV clearance', 'Public sector',
    'Business analysis|Business analyst|requirements gathering|requirements analysis', 'Process mapping|BPMN|as-is|to-be', 'User stories|acceptance criteria|backlog',
    'Jira|Confluence', 'SQL', 'Product owner', 'Gap analysis', 'Functional specifications|functional specs|functional design',
    'ServiceNow', 'Salesforce', 'Workday', 'Microsoft Dynamics|Dynamics 365', 'ITIL', 'Cloud|AWS|Azure'
  ];
  // Skills every field shares (useful for scoring, too broad to search on alone).
  const GENERAL = ['Stakeholder management|stakeholders', 'Team leadership|team lead|lead a team|line management|people management', 'Project management|project manager',
    'Communication skills|communication', 'Microsoft Office|MS Office|Excel|Word|PowerPoint', 'Problem solving', 'Customer service|customer-facing', 'Training|mentoring|coaching',
    'Budget management|budgets', 'Data analysis|reporting', 'Negotiation', 'Driving licence|driving license|full UK licence', 'Health and safety|H&S|HSE'];

  const F = {
    it: { muse: ['IT', 'Data and Analytics', 'Project Management', 'Business Operations'], name: 'IT, ERP and business analysis', short: 'IT & business analysis',
      titles: ['SAP Ariba', 'SAP S2P P2P', 'S/4HANA Procurement', 'SAP Business Analyst', 'IT Business Analyst', 'ERP Business Analyst'],
      lexicon: IT_LEXICON,
      coach: 'an experienced IT and ERP practitioner and hiring manager (business analysts, functional consultants, solution architects, project and programme leads)',
      example: 'SAP Ariba Solution Architect\nIT Business Analyst\nERP Functional Consultant' },
    software: { muse: ['Software Engineering', 'Data and Analytics', 'IT'], name: 'Software, data and cloud', short: 'Software & data',
      titles: ['Software Engineer', 'Data Analyst', 'Data Engineer', 'DevOps Engineer', 'QA Engineer'],
      role: /\b(software|developer|engineer|devops|sre|data|machine learning|ml|ai|cloud|qa|test|frontend|front-end|backend|back-end|full[- ]stack|mobile|ios|android|web|platform|security|cyber)\b/i,
      lexicon: ['JavaScript|TypeScript|JS', 'React|Angular|Vue', 'Node.js|NodeJS', 'Python', 'Java', 'C#|.NET|dotnet', 'Golang|Go language', 'SQL|PostgreSQL|MySQL', 'NoSQL|MongoDB',
        'AWS|Amazon Web Services', 'Azure', 'GCP|Google Cloud', 'Docker', 'Kubernetes|K8s', 'CI/CD|Jenkins|GitHub Actions', 'Git', 'APIs|REST|GraphQL', 'Microservices',
        'Machine learning|ML|deep learning', 'Data engineering|ETL|data pipelines', 'Spark|Databricks', 'Power BI|Tableau|Looker', 'Test automation|Selenium|Cypress|Playwright',
        'Agile|Scrum', 'Linux', 'Terraform|infrastructure as code', 'Cyber security|security', 'Mobile|iOS|Android|Flutter|React Native'],
      coach: 'a senior engineering hiring manager who runs technical and behavioural interviews',
      example: 'Software Engineer\nData Analyst\nCloud Engineer' },
    finance: { muse: ['Accounting and Finance'], name: 'Finance and accounting', short: 'Finance',
      titles: ['Accountant', 'Finance Analyst', 'Accounts Payable', 'Management Accountant', 'Financial Controller'],
      role: /\b(account|accountant|accounts|finance|financial|audit|auditor|tax|payroll|controller|bookkeep|treasury|credit|fp&a|actuar|invest|banking|analyst)\b/i,
      lexicon: ['Accounts payable|AP', 'Accounts receivable|AR', 'Month-end close|month end|year end', 'Financial reporting', 'Management accounts', 'Budgeting|forecasting', 'IFRS', 'GAAP',
        'VAT|GST|sales tax', 'Audit|internal audit', 'Reconciliations|bank reconciliation', 'Payroll', 'Advanced Excel|VLOOKUP|pivot tables', 'SAP FI|Oracle Financials|Xero|Sage|QuickBooks|Tally|NetSuite',
        'ACCA|CIMA|ACA|Chartered Accountant|CPA', 'Credit control', 'FP&A|financial planning', 'Cash flow', 'Variance analysis', 'Fixed assets', 'Compliance|regulatory reporting'],
      coach: 'an experienced finance manager who hires accountants and analysts',
      example: 'Management Accountant\nFinance Analyst\nAccounts Payable Supervisor' },
    healthcare: { muse: ['Healthcare'], name: 'Healthcare and care', short: 'Healthcare',
      titles: ['Registered Nurse', 'Healthcare Assistant', 'Care Assistant', 'Staff Nurse'],
      role: /\b(nurse|nursing|care|carer|health|healthcare|clinical|clinic|medical|doctor|physio|therap|pharmac|midwife|paramedic|radiograph|dental|hospital|patient|support worker|hca)\b/i,
      lexicon: ['Patient care', 'NMC|GNC|nursing registration|RN', 'Medication administration|medicines', 'Care plans|care planning', 'Safeguarding', 'Infection control|IPC', 'Clinical assessment|observations',
        'Phlebotomy|venepuncture|cannulation', 'Wound care|tissue viability', 'Dementia care', 'Paediatrics|children', 'Critical care|ICU|ITU', 'Electronic records|EMR|EHR|EPR|SystmOne|EMIS',
        'NHS', 'Manual handling|moving and handling', 'BLS|ILS|ALS|life support', 'Personal care', 'Mental health', 'Theatre|perioperative', 'Community care'],
      coach: 'an experienced ward manager and healthcare recruiter',
      example: 'Registered Nurse\nSenior Care Assistant\nHealthcare Assistant' },
    education: { muse: ['Education'], name: 'Education and training', short: 'Education',
      titles: ['Teacher', 'Teaching Assistant', 'Lecturer', 'Tutor'],
      role: /\b(teacher|teaching|tutor|lecturer|professor|school|education|educator|trainer|instructor|senco|sen|head of|headteacher|learning|curriculum|academic|nursery|early years)\b/i,
      lexicon: ['Lesson planning', 'Curriculum|syllabus', 'QTS|PGCE|B.Ed|BEd|teaching qualification', 'Safeguarding', 'SEN|SEND|special educational needs', 'Classroom management|behaviour management',
        'Assessment|marking', 'EYFS|early years', 'GCSE', 'A-level|A level', 'CBSE|ICSE|IB|International Baccalaureate', 'Differentiation', 'Pastoral care', 'Ofsted', 'E-learning|LMS|Moodle|Google Classroom',
        'Parent communication|parents', 'Subject leadership|head of department', 'Exam preparation'],
      coach: 'an experienced head teacher who interviews teaching staff',
      example: 'Secondary Maths Teacher\nPrimary Teacher\nTeaching Assistant' },
    engineering: { muse: ['Science and Engineering', 'Manufacturing and Warehouse'], name: 'Engineering and manufacturing', short: 'Engineering',
      titles: ['Mechanical Engineer', 'Civil Engineer', 'Electrical Engineer', 'Quality Engineer', 'Maintenance Engineer'],
      role: /\b(engineer|engineering|mechanical|civil|electrical|electronics|manufactur|production|quality|maintenance|design engineer|structural|process engineer|technician|cad|plant|automation)\b/i,
      lexicon: ['AutoCAD', 'SolidWorks', 'CATIA', 'Creo|Pro/E', 'CAD|CAM|CAD/CAM', 'FEA|ANSYS|finite element', 'Lean|Six Sigma|Kaizen|5S', 'Quality|ISO 9001|QMS', 'Root cause analysis|RCA|8D',
        'PLC|SCADA', 'Preventive maintenance|planned maintenance', 'Design for manufacture|DFM', 'Commissioning', 'Revit', 'BIM', 'MATLAB', 'GD&T', 'Project engineering', 'CNC|machining', 'Chartered Engineer|CEng|IEng'],
      coach: 'an experienced engineering manager who hires engineers and technicians',
      example: 'Mechanical Design Engineer\nQuality Engineer\nMaintenance Engineer' },
    sales: { muse: ['Sales', 'Marketing', 'Account Management'], name: 'Sales and marketing', short: 'Sales & marketing',
      titles: ['Account Manager', 'Sales Executive', 'Marketing Manager', 'Digital Marketing Executive', 'Business Development Manager'],
      role: /\b(sales|account manager|account executive|business development|bdm|marketing|brand|seo|ppc|content|social media|communications|pr|growth|customer success|partnership|campaign|e-?commerce)\b/i,
      lexicon: ['B2B', 'B2C', 'Account management|key accounts', 'CRM|Salesforce|HubSpot|Zoho', 'Lead generation|prospecting|pipeline', 'Business development|new business', 'Digital marketing', 'SEO', 'PPC|Google Ads|paid search|SEM',
        'Social media|LinkedIn|Instagram|TikTok', 'Content marketing|content', 'Email marketing|Mailchimp', 'Brand|branding', 'Market research', 'Google Analytics|GA4|analytics', 'Copywriting', 'Campaign management|campaigns',
        'Targets|quota|revenue', 'Presentations|pitching', 'E-commerce|Shopify'],
      coach: 'an experienced sales and marketing director who hires for commercial roles',
      example: 'Account Manager\nDigital Marketing Executive\nBusiness Development Manager' },
    hr: { muse: ['Human Resources and Recruitment'], name: 'HR and recruitment', short: 'HR',
      titles: ['HR Advisor', 'HR Business Partner', 'Recruiter', 'Talent Acquisition Specialist', 'HR Manager'],
      role: /\b(hr|human resources|people|talent|recruit|recruiter|resourcing|learning and development|l&d|payroll|reward|employee relations|er advisor)\b/i,
      lexicon: ['Recruitment|talent acquisition|hiring', 'Employee relations|ER casework', 'Onboarding', 'HRIS|Workday|SuccessFactors|BambooHR', 'Payroll', 'Learning and development|L&D|training', 'Performance management',
        'Employment law', 'CIPD|SHRM', 'Compensation and benefits|reward', 'Workforce planning', 'Employee engagement', 'Absence management', 'Disciplinary|grievance', 'DEI|diversity and inclusion', 'Policy writing|HR policies'],
      coach: 'an experienced HR director who hires HR and recruitment staff',
      example: 'HR Advisor\nHR Business Partner\nIn-house Recruiter' },
    operations: { muse: ['Business Operations', 'Manufacturing and Warehouse', 'Project Management'], name: 'Operations, supply chain and procurement', short: 'Operations',
      titles: ['Operations Manager', 'Supply Chain Analyst', 'Procurement Specialist', 'Logistics Coordinator', 'Buyer'],
      role: /\b(operations|supply chain|procurement|purchasing|buyer|logistics|warehouse|inventory|planner|planning|demand|transport|shipping|fleet|distribution|category manager|sourcing|facilities)\b/i,
      lexicon: ['Supply chain', 'Procurement|purchasing|sourcing', 'Logistics', 'Inventory management|stock control', 'Warehouse management|WMS', 'Demand planning|forecasting', 'S&OP', 'Supplier management|vendor management',
        'Negotiation', 'ERP|SAP|Oracle', 'Lean|Six Sigma|continuous improvement', 'Transport|freight', 'Import|export|customs', 'KPIs', 'CIPS', 'Category management', 'Contract management', 'Budget control'],
      coach: 'an experienced operations and supply-chain director',
      example: 'Operations Manager\nProcurement Specialist\nSupply Chain Analyst' },
    customer: { muse: ['Customer Service', 'Administration and Office'], name: 'Customer service and administration', short: 'Customer service & admin',
      titles: ['Customer Service Advisor', 'Administrator', 'Office Manager', 'Receptionist', 'Executive Assistant'],
      role: /\b(customer|service|support|admin|administrator|administrative|office|receptionist|assistant|coordinator|secretary|pa|call centre|contact centre|data entry|clerk)\b/i,
      lexicon: ['Customer service', 'Call centre|contact centre|telephone', 'Complaints handling|complaints', 'CRM|Zendesk|Freshdesk', 'Data entry', 'Microsoft Office|Excel|Outlook', 'Diary management|scheduling|calendar',
        'Reception|front desk', 'Administration|admin', 'Typing|WPM', 'Minute taking', 'Invoicing', 'Filing|records management', 'Live chat|email support', 'Multilingual|languages'],
      coach: 'an experienced office and customer-service manager',
      example: 'Customer Service Advisor\nOffice Administrator\nExecutive Assistant' },
    hospitality: { muse: ['Food and Hospitality Services', 'Retail'], name: 'Hospitality and retail', short: 'Hospitality & retail',
      titles: ['Store Manager', 'Retail Assistant', 'Restaurant Manager', 'Chef', 'Hotel Receptionist'],
      role: /\b(retail|store|shop|sales assistant|cashier|restaurant|hotel|hospitality|chef|cook|kitchen|waiter|waitress|barista|bar|front of house|housekeep|catering|events|travel)\b/i,
      lexicon: ['Food hygiene|food safety|HACCP', 'Barista', 'Cash handling|till|POS', 'Customer service', 'Stock control|stock taking', 'Visual merchandising', 'Front of house', 'Kitchen', 'Housekeeping',
        'Rota|scheduling', 'Team leadership', 'Sales targets', 'Opening and closing', 'Allergens', 'Personal licence|licensing'],
      coach: 'an experienced hospitality and retail manager',
      example: 'Store Manager\nRestaurant Supervisor\nRetail Assistant' },
    creative: { muse: ['Design and UX', 'Writing and Editing'], name: 'Design, media and creative', short: 'Creative',
      titles: ['Graphic Designer', 'UX Designer', 'Content Writer', 'Video Editor', 'Product Designer'],
      role: /\b(design|designer|ux|ui|creative|content|writer|copywriter|editor|video|photograph|animator|motion|illustrat|art director|media|journalist|producer)\b/i,
      lexicon: ['Adobe Creative Suite|Adobe CC', 'Photoshop', 'Illustrator', 'InDesign', 'Figma|Sketch|Adobe XD', 'UX|user experience|user research', 'UI|user interface', 'Branding|brand identity', 'Typography',
        'Video editing|Premiere Pro|Final Cut', 'After Effects|motion graphics', 'Photography', 'Copywriting', 'Content creation', 'Web design|HTML|CSS', 'Portfolio', 'Prototyping|wireframes', 'Accessibility|WCAG'],
      coach: 'an experienced creative director who hires designers and content people',
      example: 'Graphic Designer\nUX/UI Designer\nContent Writer' },
    legal: { muse: ['Legal Services'], name: 'Legal and compliance', short: 'Legal',
      titles: ['Solicitor', 'Paralegal', 'Legal Counsel', 'Compliance Officer'],
      role: /\b(legal|lawyer|solicitor|barrister|attorney|advocate|paralegal|counsel|compliance|conveyanc|litigation|contracts manager|company secretary|regulatory)\b/i,
      lexicon: ['Contract drafting|contracts', 'Litigation', 'Compliance', 'Conveyancing|property law', 'Corporate law|M&A', 'Employment law', 'GDPR|data protection', 'Legal research', 'Due diligence',
        'SRA|Bar Council|practising certificate', 'Case management', 'Regulatory', 'AML|KYC|anti-money laundering', 'Negotiation', 'Intellectual property|IP'],
      coach: 'an experienced partner and in-house legal lead',
      example: 'Commercial Solicitor\nParalegal\nCompliance Officer' },
    trades: { muse: ['Construction', 'Installation, Maintenance, and Repairs'], name: 'Construction and trades', short: 'Construction & trades',
      titles: ['Site Manager', 'Electrician', 'Plumber', 'Quantity Surveyor', 'Project Manager Construction'],
      role: /\b(site|construction|electrician|plumber|carpenter|joiner|bricklayer|builder|labourer|surveyor|estimator|foreman|groundwork|scaffold|hvac|gas engineer|roofer|painter|decorator|plasterer|civil)\b/i,
      lexicon: ['CSCS', 'SMSTS|SSSTS', 'Site management', 'Health and safety|H&S', 'Carpentry|joinery', '18th Edition|electrical installation', 'Plumbing', 'Gas Safe', 'Bricklaying', 'Groundworks',
        'Quantity surveying|QS', 'Estimating', 'Scaffolding', 'NVQ', 'IPAF|PASMA', 'First aid', 'Reading drawings|technical drawings', 'Building regulations'],
      coach: 'an experienced construction manager who hires site staff and tradespeople',
      example: 'Site Manager\nElectrician\nQuantity Surveyor' },
    any: { muse: [], name: 'Other / mixed', short: 'Any field', titles: [], lexicon: [], coach: 'an experienced hiring manager and career coach', example: 'Your target job title\nAnother title you would accept' }
  };
  // The IT field keeps the stricter filter built for IT / BA roles.
  const IT_STRONG = /\b(sap|ariba|s\/?4\s?hana|s4|erp|coupa|jaggaer|ivalua|oracle|workday|dynamics|salesforce|servicenow|it|ict|digital|systems?|technology|technical|software|data|integration|platform|applications?|business analyst|business analysis|product owner|solution|p2p|s2p|procure[- ]to[- ]pay|source[- ]to[- ]pay|ai|cloud)\b/i;
  const IT_GENERIC = /\b(analyst|consultant|architect|transformation|programme|project|lead|manager|specialist|owner)\b/i;
  const NON_IT = /\b(buyer|driver|warehouse operative|operative|nurse|carer|care assistant|chef|cleaner|forensics?|account executive|sales executive|business development|recruitment consultant|teacher|mechanic|electrician|labourer|retail|cashier|commercial lead|security officer)\b/i;
  F.it.fits = j => { const t = j.title || ''; if (NON_IT.test(t)) return false; if (IT_STRONG.test(t)) return true; return IT_GENERIC.test(t) && IT_STRONG.test(j.jd || ''); };
  F.it.offTrack = /\b(engineer|engineering|developer|designer|scientist|marketing|sales)\b/i;
  F.it.analyst = IT_GENERIC;
  Object.entries(F).forEach(([id, f]) => { f.id = id; if (!f.fits) f.fits = j => !f.role || f.role.test(j.title || ''); });

  // ---------- which field is this user in ----------
  let cur = null;
  const cached = () => { try { return JSON.parse(localStorage.getItem('cvt.field') || 'null'); } catch (_) { return null; } };
  /** Guess a field from what someone wrote about themselves. */
  // Your saved job searches and CV names: used only while the profile has no target roles.
  let hint = '';
  const setHint = t => { hint = String(t || ''); };
  function infer(p) {
    const txt = [...(p.targetRoles || []), p.currentTitle || '', p.extraSkills || '', (p.targetRoles || []).length ? '' : hint].join(' \n ');
    if (!txt.trim()) return 'any';
    if (/\b(sap|ariba|erp|s\/?4\s?hana|business analyst|it business|functional consultant|servicenow|salesforce|workday)\b/i.test(txt)) return 'it';
    let best = 'any', score = 0;
    Object.values(F).forEach(f => { if (!f.role) return; const n = (txt.match(new RegExp(f.role.source, 'gi')) || []).length; if (n > score) { score = n; best = f.id; } });
    return best;
  }
  const idOf = p => (p && F[p.field] ? p.field : p ? infer(p) : (cached() && F[cached()] ? cached() : 'any'));
  /** Remember the field for synchronous callers (prompts, drill decks). */
  function use(p) { cur = idOf(p); try { localStorage.setItem('cvt.field', JSON.stringify(cur)); } catch (_) {} if (p) profile = p; return F[cur]; }
  let profile = null;
  const current = () => F[cur || (cached() && F[cached()] ? cached() : 'any')];

  /** Words the AI prompts use, so the coach speaks for the user's own field and country. */
  function vars() {
    const f = current(), p = profile || {};
    const roles = (p.targetRoles || []).filter(Boolean).slice(0, 3);
    const cc = window.CVT.countries ? window.CVT.countries.get(window.CVT.countries.current()) : { name: 'United Kingdom' };
    const us = cc.name === 'United States' || cc.name === 'Canada';
    const who = f.id === 'it' ? 'senior SAP, ERP and IT business-analysis professionals' : roles.length ? `candidates targeting roles such as ${roles.join(', ')}` : `candidates in ${f.name.toLowerCase()}`;
    return {
      MARKET: cc.name === 'United Kingdom' ? 'UK' : cc.name,
      LANG: us ? 'US English' : 'UK English',
      WHO: who,
      EXPERT: f.id === 'it' ? 'an experienced SAP procurement and IT practitioner (SAP Ariba, Source-to-Pay, Procure-to-Pay, SAP MM, Guided Buying, S/4HANA Sourcing & Procurement, SAP Business Network, CIG/Integration Suite, business analysis)' : f.coach,
      FIELD: f.id === 'it' ? 'SAP / IT / business-analysis' : (roles[0] || f.name.toLowerCase()),
      TOPICS: f.id === 'it' ? 'SAP / process topics' : 'technical and professional topics',
      CONTRACT: cc.name === 'United Kingdom' ? 'IR35 status for contracts, ' : '',
      TYPICAL: f.id === 'it' ? 'a typical senior SAP Ariba / S2P consultant or SAP business analyst role' : roles.length ? `a typical ${roles[0]} role` : `a typical role in ${f.name.toLowerCase()}`
    };
  }
  const fill = s => typeof s === 'string' && s.includes('{{') ? s.replace(/\{\{(\w+)\}\}/g, (m, k) => { const v = vars()[k]; return v == null ? m : v; }) : s;

  window.CVT = window.CVT || {};
  window.CVT.fields = { list: F, GENERAL, get: id => F[id] || F.any, idOf, infer, setHint, use, current, vars, fill };
})();

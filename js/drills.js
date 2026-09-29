/* drills.js — built-in practice cards for SAP procurement consultant and SAP business analyst interviews.
 * Answers are concise model answers; details can vary by release and configuration. */
(function () {
  const C = (id, deck, q, a) => ({ id, deck, q, a });
  const DECKS = {
    ariba: 'SAP Ariba',
    s4: 'S/4HANA procurement',
    p2p: 'P2P controls and finance',
    integ: 'Integration and data',
    ba: 'Business analysis',
    delivery: 'Delivery and leadership'
  };
  const CARDS = [
    // ---- SAP Ariba ----
    C('ar1', 'ariba', 'What is Guided Buying and why do organisations deploy it?',
      'Guided Buying is the consumer-style buying front end of SAP Ariba Buying. It steers casual requesters to the right channel (catalogues, preferred suppliers, forms, or sourcing requests) using policies, landing pages and tiles, so spend goes through compliant routes without users needing to know procurement rules. Benefits: higher compliance, fewer maverick purchases, faster requisitioning and less buyer effort on low-value spend.'),
    C('ar2', 'ariba', 'How do Guided Buying policies work? Give an example.',
      'Policies are rules evaluated on a request (for example amount, commodity, supplier, or user group) that trigger an action: show a message, require a justification or attachment, add an approver, or block and route to sourcing. Example: any IT hardware request over a threshold must go via a sourcing request, while under the threshold users are pushed to the approved catalogue.'),
    C('ar3', 'ariba', 'Explain punch-out catalogues vs. static (CIF) catalogues.',
      'Static catalogues are uploaded content (for example CIF or Excel templates) with items and prices held in Ariba, good for stable items. Punch-out takes the user to the supplier\'s site (Level 1) or searches supplier content from within Ariba (Level 2), returning the basket to the requisition; good for large or fast-changing ranges and supplier-maintained pricing. Trade-offs: control and validation vs. freshness and supplier effort.'),
    C('ar4', 'ariba', 'What does SAP Ariba Supplier Lifecycle and Performance (SLP) do?',
      'SLP manages the supplier journey: registration and onboarding questionnaires, qualification by category and region, preferred status, risk and compliance information, and performance reviews. It gives one supplier record with lifecycle status that downstream buying and sourcing can use, and integrates supplier master data with the ERP (often via MDG or CIG).'),
    C('ar5', 'ariba', 'How do suppliers transact with a buyer on SAP Business Network?',
      'The buyer enables suppliers (standard or enterprise accounts). POs flow from ERP/Ariba to the network; suppliers send order confirmations, advance ship notices and invoices electronically (online, cXML, EDI or CSV). Transaction rules on the buyer side validate invoices before they reach AP. Enablement waves, supplier training and fee communication are key success factors.'),
    C('ar6', 'ariba', 'What is the difference between Ariba Sourcing events types (RFI, RFP, auction)?',
      'RFI gathers information to understand the market and qualify suppliers. RFP/RFQ asks for detailed commercial and technical responses scored against criteria. Reverse auctions let qualified suppliers compete on price in real time, suited to well-specified, commoditised items. Choice depends on specification maturity, supplier market and value.'),
    C('ar7', 'ariba', 'How would you approach an Ariba Buying rollout for 4,000 users?',
      'Discovery and fit-to-standard workshops per category; design catalogues, policies and approvals; integrate with S/4 or ECC; build supplier enablement waves; test (SIT, UAT with real requesters); run change and training through super users; go live in waves by business unit; hypercare with adoption metrics (catalogue share, touchless rate, cycle time).'),
    C('ar8', 'ariba', 'What are Ariba approval flows and how do you keep them maintainable?',
      'Approval rules route requisitions, invoices and contracts to approvers based on conditions such as amount, cost object, commodity or requester. Keep them maintainable by driving approvers from master data (cost centre owners, groups) instead of hard-coding names, limiting rule count, documenting each rule, and testing edge cases like delegation and missing approvers.'),
    // ---- S/4HANA procurement ----
    C('s41', 's4', 'What is S/4HANA Central Procurement?',
      'A hub deployment where one S/4HANA system handles procurement processes (central requisitioning, purchasing, contracts, sourcing, analytics) across several connected back-end ERP systems (S/4 or ECC). It lets organisations standardise procurement without first consolidating every ERP.'),
    C('s42', 's4', 'Which S/4HANA changes matter most to a procurement consultant moving from ECC?',
      'Business Partner replaces separate vendor master maintenance; Fiori apps and embedded analytics replace many transactions and reports; simplified data model; new capabilities such as central procurement, flexible workflow for approvals and intelligent features. Migration needs BP conversion (CVI) and data clean-up.'),
    C('s43', 's4', 'Explain release strategy vs. flexible workflow for purchase approvals.',
      'Release strategies are the classic ECC/S4 approach using characteristics and classes to determine release codes. Flexible workflow (S/4HANA) uses configurable Fiori-based conditions and steps for documents such as requisitions and POs, easier to maintain by the business. Many S/4 projects move to flexible workflow; availability depends on document type and release.'),
    C('s44', 's4', 'Walk through the S/4 P2P document flow.',
      'Purchase requisition, source determination (info records, contracts, source list), purchase order, goods receipt (updates stock or consumption and posts GR/IR), invoice verification (three-way match against PO and GR), payment run. Each step creates accounting impact that must reconcile.'),
    C('s45', 's4', 'What is fit-to-standard and how does it differ from blueprinting?',
      'Fit-to-standard (SAP Activate) starts from SAP best-practice processes in a working system, shows them to the business and records gaps (delta requirements), aiming to adopt standard. Classic blueprinting starts from the as-is and documents requirements first, which often leads to more customisation.'),
    C('s46', 's4', 'Public cloud vs private cloud S/4HANA for procurement: key differences?',
      'Public cloud is SaaS with quarterly upgrades, restricted to standard configuration and key-user extensibility; faster, lower TCO, less flexibility. Private cloud (RISE) gives more configuration and custom development freedom and slower upgrade cadence. The choice drives how much custom P2P logic can be kept.'),
    // ---- P2P controls ----
    C('p1', 'p2p', 'What is the GR/IR account and why do discrepancies occur?',
      'GR/IR is a clearing account credited at goods receipt and debited at invoice receipt. Balances remain when quantities or prices differ, invoices arrive before or without receipts, or items are closed incorrectly. Regular GR/IR clearing and analysis (for example with the GR/IR monitor) is a key month-end control.'),
    C('p2', 'p2p', 'What is three-way match and when would you use two-way?',
      'Three-way match compares PO, goods receipt and invoice on quantity and price within tolerances before payment. Two-way (PO vs invoice) suits services or items without a physical receipt, often with service entry or approval instead. Tolerance settings balance control against blocked-invoice workload.'),
    C('p3', 'p2p', 'How do you reduce invoice exceptions in a P2P rollout?',
      'Push catalogue and contract buying so prices are right on the PO; enable suppliers on the network with PO-flip invoicing and validation rules; set sensible tolerances; ensure timely goods receipts; clean vendor master; monitor exception reasons weekly and fix root causes.'),
    C('p4', 'p2p', 'How does UK VAT affect P2P design?',
      'Tax codes must be determined correctly on POs and invoices (standard, reduced, zero, exempt, reverse charge for some services and construction). Invoices need valid VAT details; e-invoicing and Making Tax Digital requirements affect reporting. Design tax code determination with finance and test reverse-charge scenarios.'),
    C('p5', 'p2p', 'What controls prevent maverick or off-contract spend?',
      'Guided buying policies, catalogues and contracts as preferred channels, no-PO-no-pay rules, approval thresholds, supplier qualification status checks, spend analytics to spot leakage, and communication so users know the right route.'),
    // ---- Integration & data ----
    C('i1', 'integ', 'What is Cloud Integration Gateway (CIG) and what replaced or extends it?',
      'CIG is SAP\'s pre-packaged integration between SAP ERP/S4 and SAP Ariba and the Business Network, running on SAP\'s cloud integration platform with standard mappings for POs, invoices, master data and more. SAP positions the managed gateway within SAP Integration Suite; custom flows and extensions are built in Integration Suite.'),
    C('i2', 'integ', 'Which master data must be in sync between S/4 and Ariba?',
      'Suppliers (business partners, remit-to and ordering addresses), company codes, purchasing organisations and groups, plants, cost objects (cost centres, WBS, GL accounts), units of measure, currencies, payment terms and tax codes. Mismatches are a top cause of integration errors.'),
    C('i3', 'integ', 'How would you plan data migration for open POs at cutover?',
      'Agree the cut-off rule (for example open quantity, not fully invoiced), extract and cleanse, map to target (including new suppliers and cost objects), load with LTMC/Migration Cockpit or integration, reconcile counts and values with finance, and plan how in-flight goods receipts and invoices are handled during the freeze.'),
    C('i4', 'integ', 'What is MDG and why use it for supplier data?',
      'SAP Master Data Governance provides governed creation and change of master data with workflow, validations, duplicate checks and audit trail. For suppliers it gives one controlled process, often integrated with SLP registration, improving data quality and fraud controls.'),
    C('i5', 'integ', 'cXML vs IDoc vs API: when would you use each?',
      'cXML is the Ariba/Business Network document standard for buyer-supplier exchange. IDocs are SAP ERP\'s asynchronous message format, common in classic integration. REST/OData APIs suit modern real-time or event-driven integration with S/4 and cloud apps. Choice depends on the systems, volumes, timing and what standard content exists.'),
    // ---- Business analysis ----
    C('b1', 'ba', 'How do you elicit requirements from stakeholders who disagree?',
      'Identify stakeholders and their goals, run structured workshops with a neutral facilitator, separate the need from the proposed solution, use process maps and data to ground discussion, record options with pros and cons, and escalate to the decision owner with a recommendation. Document decisions and rationale.'),
    C('b2', 'ba', 'What makes a good user story and acceptance criteria?',
      'A story states who, what and why ("As a requester I want ... so that ..."), is small, testable and valuable. Acceptance criteria are specific, measurable conditions, often in Given/When/Then form, covering the main path and key exceptions. INVEST is a useful check.'),
    C('b3', 'ba', 'Describe as-is and to-be process mapping and the tools you use.',
      'As-is captures how work happens today (steps, roles, systems, pain points, volumes); to-be shows the target process with changes explained. BPMN swimlanes are the common notation; tools include Signavio, Visio or Lucid. Validate maps with the people doing the work.'),
    C('b4', 'ba', 'How do you prioritise requirements?',
      'Use MoSCoW or value vs. effort scoring agreed with the product owner, link each requirement to a business objective, consider regulatory must-haves and dependencies, and revisit priorities at each release.'),
    C('b5', 'ba', 'What is a gap analysis in an ERP project and what happens to gaps?',
      'Comparing required processes with standard system capability. Each gap is resolved by changing the process to fit standard, configuration, a key-user extension, an integration, a third-party product, or custom development, chosen by value, cost and upgrade impact, and approved by the design authority.'),
    C('b6', 'ba', 'How do you plan and run UAT?',
      'Define scope and entry/exit criteria, write end-to-end scenarios with business users, prepare test data and roles, train testers, run cycles with daily defect triage, track pass rates and severity, and get formal business sign-off.'),
    C('b7', 'ba', 'What KPIs would you track for a procurement transformation?',
      'Spend under management, catalogue and contract compliance, PO cycle time, touchless invoice rate, first-time match rate, invoice exception rate, supplier enablement rate, savings realised, user adoption and satisfaction.'),
    // ---- Delivery & leadership ----
    C('d1', 'delivery', 'Tell me about a go-live that went wrong. (How to structure the answer)',
      'Use STAR: context and stakes; your responsibility; the specific actions you took (triage, communication, workaround, fix, root cause); the measurable result; and what you changed afterwards. Own your part, avoid blaming others, show calm leadership.'),
    C('d2', 'delivery', 'How do you run a cutover plan?',
      'Detailed runbook with tasks, owners, timings and dependencies; data freeze and migration steps; rehearsals (mock cutovers) with timings; go/no-go criteria; communication plan; rollback plan; hypercare roster and issue triage.'),
    C('d3', 'delivery', 'How do you manage an offshore build team as a functional lead?',
      'Clear functional specs and acceptance criteria, overlapping hours for daily stand-ups, a single backlog with priorities, early walkthroughs of builds, shared test scenarios, and quick decisions on queries so the team is not blocked.'),
    C('d4', 'delivery', 'What does a design authority do on an SAP programme?',
      'It owns design principles and approves significant design decisions and deviations from standard (gaps, custom development, integrations), keeps the global template consistent, and records decisions and rationale to control complexity and cost.'),
    C('d5', 'delivery', 'Why should we hire you? (Structure)',
      'Three points tied to the job: the core requirement you have done repeatedly (with a result), a differentiator (for example end-to-end S2P across Ariba and S/4, or client-side and consultancy views), and how you work (stakeholders, delivery). Close with why this role and company specifically.'),
    C('d6', 'delivery', 'What is your approach to adoption and change management?',
      'Stakeholder analysis, sponsor messages, super-user network, role-based training close to go-live, simple guides, early wins, adoption metrics (for example catalogue share) and follow-up with low-adoption areas.')
  ];
  window.CVT = window.CVT || {};
  window.CVT.drills = { DECKS, CARDS };
})();

# LeadItNow user manual

LeadItNow is where the Chennai team finds companies that need software or IT services, works them from first contact to a signed MSA, and records what happened at every step.

## Signing in

1. Open LeadItNow and choose **Continue with Google**, using the work Google account the Founder or Director added for you.
2. If you see "This account is not invited yet", ask the Founder or Director to add your email under **Team**.

Who can do what:

| Role | Can |
|---|---|
| Founder | Everything, including approvals, Net Revenue and adding another Founder |
| Director, Marketing and Sales | Everything except deciding approvals; adds and manages the team; moves deals into contract stages; records contracts; sets discounts up to the limit; invoices |
| Business Analyst | Accounts, imports, deals, logging |
| Inside Sales | Accounts, deals, logging |
| Intern | Logging calls, meetings and notes |

## Themes

Pick Light, Dark, Ocean, Forest or Sunset with the icons at the bottom of the menu (or top right of the home page). LeadItNow remembers it in your browser.

## My day

Your start page after signing in (`/today`). Work it top to bottom:

- **Due today and overdue**: tasks from your next steps. Select **Done** when finished.
- **Next accounts to work**: the highest-priority companies with no deal yet, yours or unassigned.
- **My open deals**: each with its stage and next step. Red text means the deal is stuck.

## Adding companies

### One company

1. **Accounts → Add company**.
2. Enter the website domain (for example `acme.co.in`; a full web address also works). Add the city, industry and staff size if you know them: they decide the fit score.
3. Add the first contact if you have one, and say where the lead came from (kept for DPDP compliance).
4. Select **Add and scan**. LeadItNow checks the public website and DNS records and opens the account page.

A company can only exist once: adding the same domain again opens the existing account.

### Many companies (CSV)

1. **Accounts → Import CSV** and choose the file (Apollo or HubSpot export, or a sheet saved as CSV).
2. Check the column matches; change any that are wrong. The preview shows the first five rows.
3. Select **Import**. Rows merge into existing companies with the same domain, or the same office phone. Existing details are never overwritten: only empty fields are filled. Contacts are added once.
4. The summary shows new companies, merged companies, contacts added, and skipped rows with the reason.

New companies are scanned by the nightly job (2 am IST). To scan some straight away, select **Scan next 8** on the Accounts page.

### Finding new companies (Find leads)

Founder, Director and Business Analysts can search for companies by industry and city:

| Source | Cost | Best for |
|---|---|---|
| OpenStreetMap | Free | Shops, clinics, offices and workshops that list a website |
| Wikidata | Free | Larger, well-known companies |
| Google Places | Free for 1,000 searches a month, then about $35 per 1,000 | The widest coverage of local businesses |
| Apollo | Company search uses no credits | Companies with 50+ staff, with decision makers |

1. **Find leads**, pick the source, industry and city; add keywords to narrow it (for example "garment exporters").
2. Tick **Also run this search every week** to keep finding new companies (Mondays, 2:30 am IST).
3. Companies with their own website are added as accounts and scanned. Companies already in LeadItNow are not added twice.
4. Companies with no website of their own (or only a Facebook or IndiaMART page) go to the **Review list**. Use **Search the web**, paste the company's website and select **Add**, or **Dismiss** it.

**Company register files**: download the company master data file for Tamil Nadu from data.gov.in, save it as CSV and import it. Active companies go to the review list (they have no website in the file); struck-off and dissolved companies are skipped.

**Decision makers (Apollo)**: on an account, select **Find decision makers (Apollo)** to see owners, directors and IT heads. **Add** puts the person in Contacts with their work email; each one uses Apollo credits.

## Reading an account

- **Need** (High 40+, Medium 20-39, Low under 20, None): how strongly the public evidence suggests they need software or services. Each signal shows its evidence.
- **Lead with**: the service line to open the conversation with.
- **Fit** (0-100): target city (Chennai, Coimbatore, Tiruppur, Madurai) 25, staff 10-500 25, target industry 25, a decision maker among the contacts 15, a referral 10.
- **Priority**: need × fit ÷ 100, plus 15 when there is a referral or an IT job post.
- **Current stack**: tools they already use. For planning only: never mention another vendor in outreach.

Add what you know that the website cannot show: **Add a signal you know about** → Referral (+25), IT job post (+20) or Growth news (+15), with the evidence. Accounts are re-scanned every 30 days; your manual signals stay.

### Contacts and consent

Record how you got every contact. If someone asks not to be contacted, select **Mark opted out** at once: they disappear from the contact lists for logging and must not be contacted again. Only tick **Agreed to WhatsApp messages** when they have said yes.

### Contact details, size and IT budget

- **Published contact details**: emails and phone numbers the company lists on its own website, found when it is scanned. Select **Add as contact** to keep one; the page it came from is recorded.
- **Size and finance**: revenue, staff, listed or unlisted (with a link to the share price and market cap), founded year, paid-up capital and CIN. **Enrich from Apollo** fills them automatically once Apollo is connected; until then, use **Enter or correct by hand**. What you type is never overwritten by Apollo.
- **Estimated IT budget**: a yearly band worked out from revenue and the industry's IT-spend percentage (Founder and Director set these under **Estimates**). It is an estimate to size the opportunity, not a figure to quote to the client.

## Working a deal

Start a deal from the account page (**Start a deal**): pick the service line and an estimated value. Leave **Originated by the India team** ticked for deals the Chennai team found; it decides the revenue share.

### Stages and exit rules

A deal moves forward one stage at a time, and only when the current stage's exit rule is met. The deal page lists what is still missing.

| Stage | To move on |
|---|---|
| 1. Target account | A contact is on the account |
| 2. Outreach | A meeting is booked or held (log it as a Meeting) |
| 3. Discovery call | The client's pain and confirmed budget are recorded |
| 4. Prototype demo | The demo meeting is logged and a champion is named |
| 5. MOU + paid scoping | The signed MOU is recorded |
| 6. MSA + SOW | The signed MSA is recorded, the deal value is set, and no approval is pending |
| 7. Onboard client | The live-in-production date is set |
| 8. Renew and expand | — |

Only the Director or Founder can move a deal into MOU, MSA or Onboard, and record contracts. You can always move a deal back a stage, or mark it **Lost** with a reason (it can be reopened later).

A deal is **stuck** when it has no next step, its next step is overdue, or it has been in a stage too long (14 days for Outreach, Discovery and Demo; 21 for Target, MOU and MSA; 30 for Onboard).

### Logging touches

Use **Log a touch** on the account or deal page after every call, meeting, email or WhatsApp message. Calls and meetings must end with a **next step** and a date: it becomes your task and the deal's next step. Calls with the outcome "Not interested" or "Wrong number" need no next step.

### Contracts, discounts and approvals

- Contracts are signed by Analytical Informatics India Pvt Ltd on the approved templates only. Record each one under **Contracts** with a link to the signed copy.
- The Director can apply a discount of up to 10% directly. A larger discount, any edited clause, and any price outside the list go to the Founder: use **Set a discount** or **Ask for approval of terms or pricing**. The deal cannot leave MSA + SOW while an approval is pending.
- The Founder decides under **Approvals**; the decision and note show on the deal.

## Invoices and the Net Revenue statement (Founder and Director)

1. On the deal page, **Add invoice** with its number, date, taxable value (excluding GST) and GST.
2. When the client pays, enter the amount and date and select **Received**.
3. **Net Revenue** shows any month: invoiced and collected amounts on India-originated deals, the US licence fee (60%: brand and IP royalty 20%, platform 25%, services 15%), the India share (40%) and its 15% development reserve. **Download CSV** gives the file for the CA. The figures are before withholding tax and GST under reverse charge.

## Quick scan

**Quick scan** checks any domain without adding it to Accounts: useful on a call or at an event.

LeadItNow only reads public DNS records and public web pages. It never logs in anywhere.

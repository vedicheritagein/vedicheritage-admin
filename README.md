# Fundraiser Dashboard

Admin dashboard for the Annual Dipawali Fundraising Program. Answers, from the
live database:

- create and manage discount codes, live on the booking form immediately
- how much has been raised, and how many payments completed
- how many **people** have paid (which is not the same as how many orders)
- how many bought tickets, how many sponsored, and at which tier
- how many seats are committed
- what each person paid, when they paid, and their name, email and phone
- what discount codes have cost, and which payments are stuck or failed

Everything about payments is **read-only**: it reports on the payment tables and
cannot change them, so no bug here can alter a financial record. Refunds are
issued in the Square dashboard, where the money actually is, and arrive back
through the webhook.

The one thing it writes is discount codes, to their own table. The worst a bug
there can do is misprice a future checkout - never alter an order that already
exists.

## Run it

The API must be running first (see `../backend`), with credentials set.

```bash
# in ../backend/.env
ADMIN_EMAIL=committee@example.org
ADMIN_PASSWORD=<at least 12 characters; 16+ recommended>
```

```bash
npm install
npm run dev        # http://localhost:5175
npm test
npm run build      # static files in dist/
```

Then sign in with that email and password.

## One sign-in, not accounts

There is a single shared email and password rather than per-person accounts.
Real accounts mean a users table, password hashing, resets and session storage -
a great deal of security surface for a three-person committee running one event
a year, and every bit of it another thing to get wrong. The exchange is in the
API's `src/services/adminAuth.service.ts` and is the only place that would
change if per-person logins were ever wanted.

What signing in gets you is a **short-lived signed token** (12 hours by
default). The password stops travelling after sign-in, sessions expire on their
own, and changing the password signs everybody out.

A wrong email and a wrong password give the same message. "No such user" would
tell whoever is guessing which address is worth attacking.

## The security properties worth knowing

**The dashboard does not exist unless it is switched on.** Without both
`ADMIN_EMAIL` and `ADMIN_PASSWORD` on the API, every `/admin` route answers
404 - the same answer as a route that was never written. A deployment that
forgets them exposes nothing, and a prober cannot tell a dashboard could be
there. If sign-in reports that the dashboard is switched off, that is this
check, not a broken URL.

**A short password is refused at boot** (under 12 characters), and a weak one is
warned about on every boot. A password that looks like security while providing
none is worse than an obvious hole. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

**Sign-in is rate limited to five attempts per fifteen minutes**, per client.
That is generous for someone pasting from a password manager and hopeless for
guessing.

**The token lives in `sessionStorage`, not `localStorage`.** It is scoped to the
one tab and gone when that tab closes, so a token to the whole donor list does
not outlive a browsing session on a shared committee laptop. It survives a
refresh, which is the one convenience worth having mid-event.

**Nothing is cached.** The API marks every `/admin` response `no-store`, and the
page is `noindex, nofollow` with `no-referrer`, so the URL cannot leak onward
through a referrer header and the contents cannot sit in a shared proxy.

**No card numbers.** There are none in the database to show - the buyer enters
them on Square's page. The dashboard shows brand and last four only, because
that is all that exists.

## Same origin, on purpose

The API allows exactly one browser origin (`CORS_ORIGIN`), and it belongs to the
public fundraiser site. Rather than widening that - which would let any web page
call the payments API from a browser - the dashboard is served **same-origin
with the API**, so its requests are not cross-origin at all.

- **Development:** the browser only ever talks to this dev server, which
  forwards `/admin/*` to the API (`server.proxy` in `vite.config.ts`).
- **Production:** serve `dist/` behind the same hostname as the API, on a path
  such as `/admin`, via the load balancer or reverse proxy. Nothing else to
  configure.
- **If it really must live on its own origin:** set `VITE_API_BASE_URL` to the
  API and add that origin to the API's `CORS_ORIGIN`. Note that the engine takes
  a single origin, so this trades away the site's own restriction - prefer the
  path.

## Figures, and what they mean precisely

A fundraiser's numbers have to mean something exact, so:

- **"Raised so far" counts only money that actually moved** - every headline
  total filters on `status = 'paid'`. A pending order is somebody who opened the
  payment page, which is not a donation.
- **People, orders, tickets and seats are four different figures**, all reported
  separately and never conflated. One person can buy twice; one order can seat
  ten.
- **Days are New York days.** `ADMIN_TIMEZONE` (default `America/New_York`)
  decides the day boundary, so an 8pm sale is not filed under tomorrow.
- **Discounts are shown as what they cost**: face value before codes, alongside
  what was actually taken.

## Discount codes

Create a code here and buyers can use it on the booking form immediately - no
deploy, no restart, nothing to wait for. The API reads the code at the moment of
purchase, which is also what makes **Switch off** an immediate control: it stops
working on the very next booking, including for someone who already has it
applied on an open form.

Each code takes a percentage or a fixed amount, and optionally a cap on a
percentage, a minimum order value, a start and end, whether it applies to
tickets, sponsorships or both, a total number of uses, and one-use-per-email.

Three things the form does on purpose:

- **A percentage asks for a cap.** Without one, 10% off a ten-ticket order gives
  away $100. The field is marked strongly recommended for that reason.
- **Amounts are typed in dollars and sent in cents.** Money is only ever integer
  cents past this screen, the same rule the API follows.
- **A code cannot be renamed.** It is printed on flyers and cited by the orders
  that already redeemed it, so editing changes the terms and never the name.

The **Used** column counts orders that actually *paid*, not checkouts that
started - the same figure the redemption limit is enforced against. That is why
**Delete** disappears once a code has been used: the paid order cites it, and
deleting it would leave that order explaining itself with a code that no longer
exists. Switching off achieves the same intent and keeps the record.

## The orders table

Built for the two things actually done with it - find one person fast, and take
the whole list away:

- search across name, email, phone, reference and discount code
- filter by status and by ticket vs sponsorship; sort by name, amount or date
- **Export CSV** exports everything the current filter selects (up to the API's
  500-row cap), not just the visible page

Amounts in the export are plain decimal numbers so a spreadsheet can sum them,
and every cell is quoted, with anything starting `=`, `+`, `-` or `@` prefixed
with an apostrophe. Buyer-supplied names are untrusted text, and a spreadsheet
would otherwise run such a cell as a formula.

All filtering, sorting and paging happen on the server. Doing it here would mean
either shipping the whole table to filter three rows out of it, or showing a
"sorted" view that only sorts the page you can already see.

## Design notes

Light theme only, deliberately: a dark variant is not a flip of these values,
it needs its own colour steps validated against a dark surface, and the case
worth optimising is a laptop in a bright hall.

One hue does all the data encoding, checked for contrast against the chart
surface. The four status colours are a reserved set that never doubles as a
series colour, and each is always shown **with its text label** - two of them
sit below 3:1 against this surface by design, so colour never carries the
meaning alone.

The daily chart is HTML and CSS rather than SVG. A fluid SVG needs either
`preserveAspectRatio="none"`, which stretches axis text into illegible smears
(the first attempt did exactly that), or a fixed viewBox that letterboxes on a
wide screen. Percentage-height divs are fluid by nature and their labels are
real text.

## Tests

```bash
npm test
```

Drives the real components through a real DOM with only `fetch` replaced, and
For discount codes it covers the boundary that matters: dollars in the form
become integer cents on the wire, a percentage travels as points, a switch-off
sends nothing but the flag (so it cannot rewrite a code's terms with whatever
the form held), an edit patches the code from the row rather than the field, and
delete asks before it acts.

It also covers what matters elsewhere: nothing renders before authentication, credentials are
posted in the body and never put in a URL, the email is trimmed but the password
never is, every read carries the bearer token, a rejected password is cleared
from the field while the email is kept, an expired session returns to sign-in
saying so, filters and sorting go to the server, the search is debounced into
one request, and the CSV neutralises a cell a spreadsheet would execute.

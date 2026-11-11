# FlightScout

**Chat with Scout, an AI flight assistant for domestic Nigerian flights. Say where you want to go, get the best 3 flights, spot cheaper days, and pay with PayPal, all inside the chat.**

Built for the PayPal AI Hackathon 2026. License: MIT.

> "I'm travelling from Lagos to Enugu next Friday. I prefer morning flights, but show me anything below ₦150,000."

## What it does
- **Fresh-chat screen:** a calm start page with the message box in the middle and example chips, like the big AI assistants. Signed-in users are greeted by name.
- **Conversation:** Scout welcomes you, understands plain sentences, remembers the conversation ("actually make it evening", "business class instead") and answers travel questions (baggage, ID, check-in). Answers carry a reminder to confirm with the airline.
- **Top 3 flights:** respects your budget and ranks your preferred time of day first. Shows what it understood so you can check it.
- **Cheaper days:** after every search it checks the day before and after with real searches and suggests them when they save at least ₦5,000, for example "Thursday: ₦25,000 cheaper".
- **Checkout in the chat:** passenger details, optional extras (extra bags, free special assistance such as wheelchair help), then PayPal. The server looks up the fare itself, so the browser can never change the price, and it verifies the amount PayPal captured before issuing a booking reference.
- **Multi-city trips:** "Lagos to Warri on the 14th, then Owerri 2 days later, then back to Lagos" gives the 3 cheapest flights for each leg, the cheapest total, and one payment for the whole trip. Up to 5 flights. Needs the AI (basic mode searches one route at a time).
- **Airport names:** works with cities, airport names ("Murtala Muhammed", "Sam Mbakwe", "Osubi") and 3-letter codes.
- **When nothing fits your budget:** Scout says so, shows how far over the cheapest flight is, and checks two days either side for days that do fit. If nothing does, it says that plainly.
- **After you pay:** a ticket card with the booking reference, a printable ticket page (save as PDF), an "Email me this receipt" button, free seat choice on a seat map, and a short "Before you fly" card (be at the airport 2 hours before, check-in desk closes about 45 minutes before, gate closes about 20 minutes before; typical times, airlines differ). Online check-in is not available through FlightScout, so the card links to the airline's own site.
- **Personal greetings:** sign-up asks for gender and age so Scout can greet you properly ("Hello Mr. Alex", "Hello Alex"). Titles are used only for adults aged 35 or over who gave a gender; you can change both in Settings.
- **Three looks:** default dark blue, black, or white (Settings, Appearance). Pop-ups blur the page behind them.
- **Accounts with email verification:** sign up with name, email and password, then enter the 6-digit code emailed to you. Passwords are hashed. An email that is already registered is detected at sign up. The profile menu (click your name) has Settings, Language, Upgrade plan (coming soon) and Log out.
- **Side panel and accounts:** saved chat history with search, new chat, sign in / sign up, and settings (appearance, how Scout greets you). Guests can chat and book without an account; their chat stays in the tab but is not saved to history. Signing in keeps the current chat.
- **Message actions:** hover a message for copy, edit, re-ask (yours) or copy, thumbs up/down, try again (Scout's), plus the time it was sent.
- **Airline logos:** drop logo files in `public/logos` (see the README there). Until then, each airline shows an initials badge.
- **AI used:** Claude (`ANTHROPIC_API_KEY`) or any OpenAI-style service (`OPENAI_API_KEY`), for example Groq with `OPENAI_API_URL=https://api.groq.com/openai` and `OPENAI_MODEL=openai/gpt-oss-120b`. The AI decides what the traveller wants; the app does the searching, so prices are never invented. With no key, a basic built-in reader handles simple searches only.

## Be clear about what is real
- **Beta mode (`DEMO_MODE=true`) uses generated SAMPLE fares**, labelled "Sample fare" on screen. They are not real airline prices.
- **The routes in the sample data follow the real airlines.** An airline only shows fares on routes it is reported to fly (for example Rano Air never appears on Enugu routes). They come from public route listings and news up to November 2026 and are kept in `lib/network.js`; some smaller airlines are less certain. If no airline flies a pair directly, Scout says so and suggests going via Lagos or Abuja.
- **PayPal runs in the sandbox.** No real money moves and no real ticket is issued. The confirmation says so.
- **Real suppliers are not bookable yet.** Duffel search works with a token, but its fares cannot be booked.
- PayPal cannot charge naira, so checkout is in US dollars at `NGN_PER_USD`.
- Bookings are saved with the accounts data (newest 300), so tickets, seats and receipts keep working after a restart; the same Render free-plan caveat below applies. Seat maps and taken seats are sample data, and extras and assistance requests are only recorded on the booking.
- Email: sign-up codes and receipts are sent through Brevo, Resend or a Gmail Apps Script relay when configured (see `.env.example`). With none configured, the beta shows the sign-up code on screen (`SHOW_CODE_ON_SCREEN=true`) and the receipt button opens the visitor's own email app.
- Accounts and chats are saved in `data/store.json`. On Render's free plan this file is wiped when the service redeploys. To keep accounts, add a free Upstash Redis database (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`); FlightScout then keeps a cloud copy and reloads it on start. A real launch needs a proper database. Passwords are stored hashed (scrypt), never in plain text.

## Try it (for judges)
1. Open the live demo link.
2. Click an example message, or type your own.
3. Select a flight and fill in any passenger details.
4. Pay with the PayPal sandbox buyer account:
   - Email: `sb-mew47p53816550@personal.example.com`
   - Password: `IjLzrK8^`

## Run it yourself
1. Install Node.js 20+. In this folder run `npm install`.
2. Copy `.env.example` to `.env` and fill in the PayPal sandbox client ID and secret, plus an AI key.
3. `npm start`, then open http://localhost:3000.

## Put it online (Render)
Upload to GitHub. In Render choose **New + > Blueprint**, pick the repository (`render.yaml` sets the build), then fill in the secret values: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `OPENAI_API_KEY` (a Groq key; the Groq address and model are already set in `render.yaml`). `SESSION_SECRET` is generated for you. Add the free Upstash and email settings if you want accounts to survive restarts and real emails. Free Render services sleep after about 15 minutes idle, so ping `/api/health` every 5 minutes with a free monitor such as UptimeRobot.

## Folder guide
- `server.js`: API, search, nearby-day suggestions, rate limits, checkout
- `lib/ai.js`: Scout's brain (Claude, OpenAI, basic fallback)
- `lib/paypal.js`: PayPal Orders API
- `lib/store.js`: accounts, sign-in cookies, saved chats (a simple file, replace with a database later)
- `lib/network.js`: which airline flies which route (used by the sample fares)
- `lib/airlines.js`: the 21 airlines and websites Scout knows about
- `lib/places.js`: places with no airport and the nearest one we cover
- `lib/extras.js`: extra bags, special assistance, seat map and check-in times
- `lib/receipt.js`: the printable ticket page and the receipt email
- `lib/profile.js`: how Scout addresses a signed-in person
- `lib/mail.js`: sends emails (Brevo, Resend or Gmail relay)
- `lib/money.js`, `lib/offers.js`: currency and remembered fares
- `providers/demo.js`, `providers/duffel.js`: fare sources (Wakanow and airline APIs would go here)
- `public/`: the chat website

## Next steps
Wakanow or airline API access for real Nigerian fares and ticketing; a "request this flight" option for airlines with no API; a database for bookings.

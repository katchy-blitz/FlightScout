# Hackathon submission pack (PayPal AI Hackathon 2026)

Deadline: 12 Nov 2026, 12:00 PM Pacific (about 9:00 pm Lagos). Confirm on the Devpost page.

## Project description (paste into Devpost, edit freely)
**FlightScout: Scout, an AI flight assistant for Nigerian domestic travel, with PayPal checkout inside the chat.**

Booking a domestic flight in Nigeria means opening many airline sites and comparing fares by hand. FlightScout turns that into a conversation. A traveller types, "I'm travelling from Lagos to Enugu next Friday. I prefer morning flights, but show me anything below ₦150,000", and Scout understands the route, date, time preference, cabin, passengers and naira budget, shows what it understood, and returns the top 3 flights. It then checks the days either side and suggests a cheaper one when it saves real money ("Thursday is ₦25,000 cheaper"). It also plans trips through several cities (for example Lagos to Warri to Owerri and back to Lagos), recognises airport names as well as cities ("Murtala Muhammed", "Sam Mbakwe"), and is honest when nothing fits the budget, showing the shortfall and checking nearby days. Follow-ups work naturally ("make it evening"), and Scout answers travel questions with a reminder to confirm with the airline. The traveller picks a flight (or one flight per leg of a multi-city trip), enters passenger details in the chat, and pays once with PayPal. Before paying they can add extra bags or free special-assistance requests; afterwards they get a ticket they can download, a receipt they can email themselves, a seat map, and a short "Before you fly" card with check-in times. Visitors can chat and book as guests; signing in saves their chat history in a side panel and lets Scout greet them by name. The server prices the fare itself and verifies the captured amount before issuing a booking reference, so the price can't be tampered with in the browser.

**How AI is used:** a large language model (Groq-hosted `gpt-oss-120b` in the demo; Claude or OpenAI also work) reads the conversation and decides whether to search, change a search, pick a flight, or answer a question. The app does the searching, so the AI never invents prices. The server validates every field the AI returns and treats the traveller's text as data, not instructions.
**How PayPal is used:** PayPal Orders API with the JavaScript SDK button inside the chat. The server creates the order from its own saved fare and captures it after approval. PayPal does not support naira, so the fare is converted to USD at a set rate.
**Honest limits:** the demo uses generated sample fares and the PayPal sandbox; no real tickets are issued. Real Nigerian airline fares need supplier access (Wakanow or airline APIs), the planned next step.

## Demo video script (aim for 2 minutes, the limit is 3)
1. Open the site. Say what it is in one sentence. Point out the "Beta mode" label.
2. Click the first example. Show Scout's reply, the chips showing what it understood, and the 3 cards.
3. Point at the cheaper-day suggestion. Click "Show these flights" for Thursday.
4. Type "actually make it evening" to show it remembers the conversation.
5. Ask a question, such as "how much baggage can I carry?" and show the answer with its reminder.
6. Select a flight, open "Add extras" and add a bag (watch the total change), fill in the passenger details, and pay with the sandbox buyer account.
7. Show the ticket card: click "Choose seats" and pick one, then show "Before you fly" (three times, simple). Close with the safeguards: server-side pricing and amount check.

Optional extras if you have time (still keep the video under 3 minutes):
- Multi-city: click the multi-city example, choose one flight per leg, and book all of them with one payment.
- Budget honesty: type "Lagos to Abuja on Friday under 90k" and show Scout explaining the shortfall and the cheaper days that fit.
- Show the fresh-chat start screen and the three looks (Settings, Appearance).
- Hover over a message to show copy, edit and re-ask, and open the side panel with saved chats after signing in.
- Do NOT show real airline logos in the video unless you have permission (Devpost bans third-party trademarks).

## Before you submit (checklist)
- [x] Create a PayPal sandbox app (US business account) and copy the client ID and secret
- [ ] Make a fresh Groq key (the old one was exposed) and set it only in `.env` and on Render
- [ ] Put your name in the `LICENSE` file instead of "FlightScout team"
- [ ] Set SESSION_SECRET (any long random text) in Render so sign-in cookies stay valid between restarts
- [ ] Create a public GitHub repo (the licence must show in its About section)
- [ ] Deploy on Render and test one full payment with the sandbox buyer account
- [ ] Put the sandbox buyer email and password into the README ("Try it" section)
- [ ] Record the video (under 3 minutes) and upload it to YouTube as Public
- [ ] Write the "what changed after Oct 1 2026" note on Devpost if the project existed before 1 Oct
- [ ] Submit on Devpost: description, repo link, live link, video link, and which AI tool you used and how

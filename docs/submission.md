# Submission text

Paste these into the form at
https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit. Field names on the form may differ.

## Basics

- **Project name:** Duka Books
- **One line:** A WhatsApp bookkeeper for Kenya's dukas, on Meta's models.
- **Track:** Indie
- **Theme:** Build for Your World
- **Repo:** https://github.com/fondoadam/duka-books
- **Demo video:** https://youtu.be/oRIlghZCtjc

## Short description

Duka Books gives Kenya's corner shops real books without an app, a form or an accountant. Owners send what they
already have to a WhatsApp number: an exercise-book page, a pile of receipts, a forwarded M-Pesa SMS. It proposes
entries in Swahili, posts them to a double-entry ledger only after the owner confirms, answers questions like "faida
wiki hii?" from that ledger, and produces a monthly profit-and-loss PDF a SACCO or bank can read.

## Full write-up

### The problem

Kenya has about 7.4 million micro, small and medium establishments (KNBS 2016), and the neighbourhood duka is the most
common. Most keep records in an exercise book and money in M-Pesa. A lender can't read either, so credit often means
Fuliza overdrafts and other costly short-term loans. Bookkeeping apps ask owners to change how they work, in a
language that often isn't theirs.

### What we built

Duka Books is a bookkeeper, and a photo is only one of its inputs. It meets the owner in WhatsApp and Swahili:

- **Ledger photos:** Muse Glimmer 30B reads handwritten pages and checks them against the written total.
- **Receipt piles:** SAM 3 finds each receipt in one photo and numbers it, and each crop is read on its own.
- **M-Pesa and Fuliza SMS:** exact parsers, with no model. A Fuliza draw is booked as a loan, not income, and a
  transaction code can't be booked twice.
- **Confirm or fix:** nothing reaches the books without a tap. "Si sahihi" opens a line-by-line fix, and each fix
  becomes an example for that shop.
- **Questions:** Llama 3.1 8B calls tools over the journal. A figure guard rejects any number no tool returned.
- **Reports:** an evening summary and a bilingual monthly P&L PDF, sent in the chat.

### Use of Meta AI

Each model does the job it suits. Muse Glimmer 30B reads handwriting, SAM 3 separates receipts, and Llama 3.1 8B
handles typed records, corrections and the ask agent on our own Mac mini. Neither open-weights host supports tool
calls or JSON schemas, so we wrote an adapter that adds both through the prompt and parses replies back into the
standard format. The agent and extraction code stays the same as it would be on Muse Spark.

### Technical depth

Signed webhooks with constant-time comparison, deduplication by message ID, integer-cent double entry, rules before
models, written-total checks, untrusted text treated as data, and 185 passing tests including the full signed webhook
to journal loop.

### What's live, and what isn't

- **Live:** the WhatsApp bot on a Meta test number. A real phone sent an M-Pesa SMS and a ledger photo through to the
  journal on Nov 1, then asked for its profit and P&L PDF.
- **Video:** opens with a trimmed screen recording from a real phone (a handwritten test page, confirmed, questioned
  and turned into a P&L PDF), with waits sped up. The rest is a replay of one recorded run against the live bot: the
  replies are real, the chat is drawn on screen, and the ledger page and receipts are generated samples. All figures
  are test data, not a real shop's records.
- **Not live:** voice notes use a stub transcript, because no free host serves a Meta speech model with Swahili. Muse
  Spark is wired up but never ran, because Meta Model API access needs a card that passes a hold.
- **Limits:** photos use a free GPU quota of a few calls a day. It has not yet been used by a real shop.

### Built during the event

All code in this repo was written during the event, from an empty repo (first commit Oct 27, 2026). Meta's models,
the public Hugging Face Spaces that host them, and the libraries are credited in the README.

### What's next

A week of records from a real duka, Swahili voice notes, and a pilot with a SACCO to see whether these P&Ls can
support a loan.

## Meta tools used

Muse Glimmer 30B (live, photos), Llama 3.1 8B (live, text, corrections, agent), SAM 3 (live, receipt splitting). Muse
Spark 1.3 is wired up but never ran.

## Why are Meta's models important to your solution?

The owner's records are handwritten Swahili and Sheng in an exercise book, and a pile of paper receipts. Muse Glimmer reads that handwriting well enough to get 6 of 6 lines right on a test page, skip a crossed-out line and match the written total. SAM 3 is what makes a pile of receipts usable: it separates them so each is read alone instead of blurring together.

Open weights matter as much as quality. A shop's books are private, and a corner shop can't pay per call. Because Meta's models are open, Llama 3.1 8B runs on our own Mac mini for typed records and questions, and the whole bot runs without a paid key. That is the path to something a duka can afford.

Finally, it all lives in WhatsApp, which Kenyan shop owners already use every day, so there is nothing new to install or learn.

## Video title and description

**Title:** Duka Books: a WhatsApp bookkeeper for Kenya's corner shops

**Description:** Duka Books turns exercise-book pages, receipts and M-Pesa SMS into confirmed double-entry books, in
Swahili, inside WhatsApp. Built during the Meta Global AI Developer Hackathon with Muse Glimmer 30B, SAM 3 and
Llama 3.1 8B. Opens with a real phone recording, sped up in the waits, then a replay of one recorded run against the
live bot. All figures are test data, and the replay's photos are generated samples.
https://github.com/fondoadam/duka-books

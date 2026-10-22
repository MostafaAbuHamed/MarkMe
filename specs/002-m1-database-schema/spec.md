# Feature Specification: M1 Database Schema + Access Rules

**Feature Branch**: `002-m1-database-schema`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Go with M1" — milestone M1 of `docs/PLAN.md` (Database schema + RLS),
using the spec input seed in `docs/IMPLEMENTATION_PLAN.md` §3 M1: "Create the data store for
MarkMe: user profiles, saved items, folders, tags and the item↔tag link. Each user can only ever see
or change their own data, and this is proven by automated tests with two users. An item belongs to
at most one folder and can have many tags. A user cannot save the same (normalized) URL twice.
Folder and tag names are unique per user, ignoring case. Deleting a folder keeps its items (they
become "no folder"); deleting a tag removes it from items. Users can search their items by text
across title, descriptions, their own note, URL and tag names, combined with folder and tag
filters, ranked by relevance and paginated. The schema is also applied to the hosted production
database."

Design decisions already approved for this milestone (`docs/IMPLEMENTATION_PLAN.md` §4): A1, A3,
A4, A11, A12 and A13–A20. They are written into the requirements below; none are reopened here.

## User Scenarios & Testing _(mandatory)_

This milestone has no screens. Its users are the **MarkMe end users**, whose data it stores and
protects, and the **contributors** who build the extension (M4–M7) and the preview service (M3) on
top of it. Each story is proven by automated database tests, not by a UI.

### User Story 1 - A user's collection is private to them (Priority: P1)

A person signs up and gets a profile automatically. Everything they store afterwards (items,
folders, tags and the links between items and tags) is visible and changeable only by them. Another
signed-in user cannot read, change, delete or attach anything to it, even by guessing ids or by
submitting someone else's user id.

**Why this priority**: Security by Default is the constitution's non-negotiable principle, and
"a table without access rules does not merge". Every other story stores data inside these rules.

**Independent Test**: With two test users A and B, user A creates one of each kind of record. Then,
acting as B, every read returns nothing of A's and every write against A's records is refused.
Acting as A, the same operations succeed on A's own records.

**Acceptance Scenarios**:

1. **Given** a new account is registered, **When** registration completes, **Then** a profile
   exists for that account, with a display name taken from the account's full name or, if there is
   none, from the part of the email before `@`.
2. **Given** user A has a profile, **When** A reads profiles, **Then** A sees only their own; A can
   change their own display name, and cannot create or delete a profile.
3. **Given** user A owns items, folders, tags and item↔tag links, **When** user B reads any of
   them, **Then** B gets no rows.
4. **Given** user A owns a record, **When** user B tries to change or delete it, **Then** nothing
   changes.
5. **Given** a user creates a record, **When** the request names an owner (their own id or someone
   else's), **Then** the request is refused; the owner is always the signed-in user and is filled
   in by the system.
6. **Given** user A owns an item and user B owns a tag, **When** A tries to attach B's tag to A's
   item (or B's item to A's tag), **Then** the link is refused.
7. **Given** user A owns an item and user B owns a folder, **When** A tries to put the item in B's
   folder, **Then** the change is refused.
8. **Given** a request is made without a signed-in user, **When** it reads or writes any user data,
   **Then** it gets nothing and changes nothing.

---

### User Story 2 - Items, folders and tags follow the product rules (Priority: P2)

A user's collection holds saved links (items). Each item has the original URL, a normalized URL
used for duplicate checks, preview data (title, description, image, favicon, site name, media type,
optional video embed), an optional folder, any number of tags, and the user's own note. The data
store enforces the product rules so no client can break them: no duplicate URLs, unique folder and
tag names ignoring case, a saved URL never changes, folder and tag deletion never deletes items,
and every text field has a length limit.

**Why this priority**: These rules (D1, D3, constitution V) are what the save flow (M5) and the
library (M6, M7) rely on. They cannot be enforced only in the extension, because a client can be
bypassed.

**Independent Test**: As one user, create folders, tags and items, then try each rule-breaking
write (duplicate URL, duplicate name in other casing, over-long text, malformed URL, changing a
saved URL, bad embed) and confirm each one is refused, while valid writes succeed. Delete a folder
and a tag and confirm the items survive.

**Acceptance Scenarios**:

1. **Given** user A saved an item with a given normalized URL, **When** A saves another item with
   the same normalized URL, **Then** it is refused; **When** user B saves the same URL, **Then** it
   succeeds.
2. **Given** user A has a folder named "Reading", **When** A creates or renames a folder to
   "reading", **Then** it is refused; **When** user B creates "Reading", **Then** it succeeds. Tags
   behave the same way.
3. **Given** a folder or tag name that is empty, only spaces, or longer than 100 characters,
   **When** it is saved, **Then** it is refused.
4. **Given** a new item, **When** it is saved, **Then** its preview status starts as "pending"
   and its media type defaults to "link" unless given.
5. **Given** an item exists, **When** the user edits its title, note, folder, preview data or
   preview status, **Then** the change is kept and the item's "last updated" time moves forward;
   **When** the user tries to change its URL or normalized URL, **Then** it is refused.
6. **Given** a URL or normalized URL that does not start with `http://` or `https://`, or is
   longer than 2,048 characters, **When** an item is saved with it, **Then** it is refused.
7. **Given** text over its limit (title 500, description 2,000, note 1,000, site name 200, image
   and favicon addresses 2,048), **When** an item is saved or edited with it, **Then** it is
   refused.
8. **Given** an item with a video embed, **When** only one of embed provider and embed id is set,
   or the provider is YouTube and the id is not a valid YouTube video id, **Then** it is refused.
9. **Given** a folder holds items, **When** the folder is deleted, **Then** the items remain and
   now have no folder.
10. **Given** a tag is attached to items, **When** the tag is deleted, **Then** it is removed from
    those items and the items remain.
11. **Given** an item has tags, **When** the item is deleted, **Then** its tag links go too, and
    the tags themselves remain.
12. **Given** an account is deleted, **When** deletion completes, **Then** its profile, items,
    folders, tags and links are deleted with it.
13. **Given** a user tries to set a system-managed field (record id, owner, creation time, last
    updated time, search data), **When** they create or edit a record, **Then** the request is
    refused.

---

### User Story 3 - Users can search and filter their collection (Priority: P3)

A user types a few letters or words and gets their matching items, best matches first. Matching
covers the title, the preview description, their own note, words in the URL and the names of the
item's tags. Search combines with a folder filter (a specific folder, or "no folder") and a tag
filter (items that have all the selected tags). Results come in pages, and each result carries the
item's tags so the list can show them.

**Why this priority**: Search and filters (D5, US-11, US-12, US-13) are a core product promise, and
M6 builds directly on this. It depends on the records from Stories 1 and 2.

**Independent Test**: As one user, save a known set of items with known titles, notes, URLs and
tags, then run each query and filter combination and compare the returned items and their order
with the expected list. Repeat as a second user and confirm none of the first user's items appear.

**Acceptance Scenarios**:

1. **Given** item X has the word in its title and item Y has it only in its description, **When**
   the user searches for that word, **Then** both are returned and X ranks above Y.
2. **Given** items whose only match is a tag name, a note, or a word in the URL, **When** the user
   searches for that word, **Then** each such item is returned.
3. **Given** an item titled "React hooks", **When** the user searches for "reac", **Then** the item
   is found (word-prefix matching, A14); **When** the user searches "reac hoo", **Then** it is
   found, and an item matching only one of the two words is not.
4. **Given** search text containing symbols that a search engine might treat as operators (for
   example `a & !b`, `:*`, `(`), **When** the user searches, **Then** no error occurs and the text
   is treated as plain words.
5. **Given** search text that is empty, only spaces, or only punctuation, **When** the user
   searches, **Then** they get their normal list, newest first (A20).
6. **Given** no search text, **When** the user lists items, **Then** results are ordered newest
   first, with a stable order for items saved at the same moment.
7. **Given** items in folder F, in other folders and in no folder, **When** the user filters by F,
   **Then** only F's items are returned; **When** the user filters by "no folder", **Then** only
   items without a folder are returned (A13); **When** both filters are given at once, **Then** the
   request is refused with an error.
8. **Given** the user selects tags T1 and T2, **When** they filter, **Then** only items that have
   both T1 and T2 are returned (A3).
9. **Given** a tag is renamed, **When** the user searches for the new name, **Then** the tagged
   items are found, and they are no longer found by the old name.
10. **Given** more matching items than one page holds, **When** the user asks for consecutive
    pages, **Then** each item appears exactly once across the pages; page size defaults to 20 and
    is limited to between 1 and 50.
11. **Given** users A and B have items with the same words, **When** A searches or filters,
    **Then** only A's items are returned.

---

### User Story 4 - Contributors build on one shared, current schema (Priority: P4)

Contributors working on the extension and the preview service get the data shapes as generated
types from the shared database package, so app code cannot drift from the real schema. The same
schema is applied to the hosted production database, and the steps to do that are documented.

**Why this priority**: M3, M4 and M5 need the types and a real hosted database to connect to, but
end users get nothing from this until those milestones ship.

**Independent Test**: Rebuild the local database from the migrations, regenerate the types and
confirm nothing changed against the committed types. Compare the migration history of the local
and hosted databases and confirm they match.

**Acceptance Scenarios**:

1. **Given** the migrations, **When** a contributor regenerates the types, **Then** the result is
   identical to the committed types, and CI fails any pull request where they differ.
2. **Given** the shared database package, **When** app code imports it, **Then** it gets the row
   types for every table and the result type of the search.
3. **Given** the hosted production project exists, **When** a contributor follows the README
   "Database" section, **Then** the migrations are applied and the hosted migration history matches
   the local one.
4. **Given** the hosted project, **When** someone inspects the repository and CI, **Then** no
   database password or service key for it is committed or stored in CI.

---

### Edge Cases

- **Same URL, different text**: two URLs that normalize to the same value are duplicates; the data
  store compares only the normalized URL it receives and does not normalize again (A17).
- **Item in a deleted folder, then searched**: it appears under the "no folder" filter.
- **Tag deleted while used as a filter**: filtering by a tag that no longer exists returns no
  items; it does not fail.
- **Name differs only by surrounding spaces or case**: case-only differences count as duplicates.
  Surrounding spaces are a client concern (the domain package trims names in M2).
- **Very long tag list on one item**: still searchable; no tag-count limit in v1.
- **Search with a filter and no text**: returns the filtered list newest first.
- **Search text in Arabic or mixed languages**: matched word by word without English stemming
  (A4), so Arabic and English words both match by prefix.
- **Preview data longer than the limits**: the preview service truncates before saving (A18), so a
  long page description never makes a save fail.
- **Offset beyond the last page**: returns an empty page, not an error.
- **Profile display name missing**: an account with no full name and an email gets the email's
  local part; the field may be empty for accounts with neither.

## Requirements _(mandatory)_

### Functional Requirements

**Records and ownership**

- **FR-001**: The system MUST store five kinds of record: profiles, items, folders, tags and
  item↔tag links, with the fields listed in PRD §6 as amended by A1 (favicon), A12 (tag creation
  time) and A19 (embed provider + id instead of embed markup).
- **FR-002**: The system MUST create a profile automatically when an account is registered, with a
  display name from the account's full name, else the email's local part.
- **FR-003**: Every item, folder and tag MUST be owned by exactly one user, and the owner MUST be
  set by the system from the signed-in user, never from a value the client submits.
- **FR-004**: A user MUST only be able to read, create, change and delete their own items, folders,
  tags and item↔tag links, and read and change only their own profile. Requests without a signed-in
  user MUST get no user data.
- **FR-005**: An item↔tag link MUST only be creatable, readable and deletable when the same user
  owns both the item and the tag. Links are never edited, only created and deleted.
- **FR-006**: An item MUST NOT be placeable in a folder owned by another user, by any path.
- **FR-007**: Clients MUST NOT be able to create or delete profiles.
- **FR-008**: Clients MUST only be able to set an explicit allowlist of fields (A15, A16). Item
  creation: URL, normalized URL, title, description, image, favicon, site name, media type, embed
  provider, embed id, folder, note, preview status, preview fetch time. Item edits: the same list
  without URL and normalized URL. Folders and tags: name only. Record id, owner, creation time, last
  updated time and search data MUST never be client-settable. Any field added later MUST stay
  locked until it is explicitly allowed.
- **FR-009**: Access rules MUST be switched on for all five kinds of record, and each rule MUST be
  covered by automated tests with at least two users covering read, write and cross-user denial.

**Product rules**

- **FR-010**: A user MUST NOT have two items with the same normalized URL. Different users may save
  the same URL.
- **FR-011**: The system MUST accept the normalized URL computed by the shared domain normalizer and
  check only that it starts with `http://` or `https://` and is at most 2,048 characters (A17).
- **FR-012**: An item's URL and normalized URL MUST NOT change after it is saved (A15).
- **FR-013**: Folder names MUST be unique per user ignoring case; the same applies to tag names.
  Names MUST be 1–100 characters, not counting surrounding spaces, and not blank.
- **FR-014**: The system MUST enforce length limits: URL, normalized URL, image address and favicon
  address 2,048; title 500; description 2,000; note 1,000; site name 200 (A18).
- **FR-015**: Media type MUST be one of article, video, image, post or link, defaulting to link.
  Preview status MUST be one of pending, ok or failed, defaulting to pending.
- **FR-016**: Embed provider and embed id MUST be both set or both empty. The only provider in v1
  is YouTube, and its id MUST match the YouTube video id format (11 characters of letters, digits,
  `-` and `_`). No embed markup is stored (A19).
- **FR-017**: An item MUST belong to at most one folder and MAY have any number of tags (D1).
- **FR-018**: Deleting a folder MUST leave its items in place with no folder. Deleting a tag MUST
  remove its links and leave the items in place. Deleting an item MUST remove its links and leave
  the tags. Nothing other than an explicit item delete or an account delete removes an item.
- **FR-019**: Deleting an account MUST delete that user's profile, items, folders, tags and links.
- **FR-020**: An item's "last updated" time MUST move forward on every change to it.

**Search**

- **FR-021**: The system MUST provide one search operation over a user's own items that matches
  text in the title, preview description, note, URL words and tag names, and applies the same access
  rules as direct reads.
- **FR-022**: Matches MUST be ranked by relevance with title weighted highest, then tag names and
  note, then description, then URL words. Ties and no-text listings MUST be ordered newest first
  with a stable order.
- **FR-023**: Search text MUST be matched as word prefixes, with every word required (A14), without
  language-specific stemming (A4). The text MUST be treated as plain words: no character in it can
  cause an error or change the meaning of the query.
- **FR-024**: Search text with no words (empty, spaces or punctuation only) MUST be treated as no
  text and return the normal list (A20).
- **FR-025**: Search MUST accept an optional folder filter, an optional "no folder" filter (A13) and
  an optional tag filter requiring all selected tags (A3). Giving the folder filter and the "no
  folder" filter together MUST be refused with an error.
- **FR-026**: Search results MUST be paginated by page size and offset; page size defaults to 20
  and is clamped to 1–50.
- **FR-027**: Each search result MUST include the item's fields, its tags (id and name) and its
  relevance score.
- **FR-028**: Search data MUST stay current when an item's title, description, note or URL changes,
  when a tag is linked or unlinked, and when a tag is renamed.

**Delivery**

- **FR-029**: All schema changes MUST be delivered as migrations, and the shared database package
  MUST export generated types for every table and for the search result.
- **FR-030**: CI MUST fail when the committed generated types differ from what the migrations
  produce.
- **FR-031**: One hosted production project MUST be created on the free plan, and the migrations
  MUST be applied to it by a documented manual step (A11). Its database password MUST NOT be
  committed or stored in CI.
- **FR-032**: The README MUST gain a "Database" section covering local reset and tests, type
  generation, and applying migrations to the hosted project.

### Key Entities

- **Profile**: one per account; display name and creation time. Created by the system on sign-up,
  deleted with the account.
- **Item**: one saved link. Original URL, normalized URL (duplicate key per user), preview data
  (title, description, image, favicon, site name, media type, optional embed provider + id), preview
  status and fetch time, optional folder, the user's note, creation and last-updated times, and
  search data kept by the system. Belongs to one user.
- **Folder**: a flat, named group; name unique per user ignoring case; creation time. An item is in
  zero or one folder.
- **Tag**: a named label; name unique per user ignoring case; creation time (A12). Many-to-many
  with items.
- **Item↔Tag link**: connects one item and one tag of the same user. Exists or not; never edited.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: For every kind of record, automated tests with two users prove read, write and
  cross-user denial; 100% of these tests pass in CI on every pull request.
- **SC-002**: 0 of the cross-user attempts in the test suite (read, change, delete, link, move into
  a folder, create with a forged owner) succeed.
- **SC-003**: Every product rule in FR-010 to FR-020 has at least one automated test that tries to
  break it, and every such attempt is refused.
- **SC-004**: For a known test collection, every search scenario in User Story 3 returns exactly the
  expected items in the expected order.
- **SC-005**: Rebuilding the database from scratch and running the full database test suite
  succeeds in one command, locally and in CI.
- **SC-006**: Regenerating the types from the migrations produces no difference from the committed
  types.
- **SC-007**: The hosted production database's migration history matches the local one, and the
  five kinds of record are visible in its dashboard.
- **SC-008**: Search over a user's collection stays within the product budget (results in under
  500 ms on 10,000 items); measured in M6, and nothing in this design prevents it.

## Assumptions

- The shared URL normalizer arrives in M2 (in parallel). This milestone only stores the normalized
  URL it receives; tests use hand-written normalized values.
- Name trimming and other input cleanup happen in the domain package (M2) and the clients. The data
  store enforces the hard limits only.
- The preview service (M3) truncates preview text to fit the limits before saving (A18).
- A single atomic "save with tags" operation (A2) belongs to M5, not here; it will inherit these
  access rules and field allowlists.
- Offset pagination is enough at 10,000 items per user; faster paging is a later optimization.
- Tag-name changes rewrite the search data of the tagged items; acceptable at personal-collection
  scale.
- Mostafa's Supabase account exists and he signs in to the CLI himself; the agent then creates the
  hosted project. The project is in Frankfurt, serves as production for v1 (no separate staging),
  and may pause after 7 idle days on the free plan.
- No Realtime, offline support, sharing, nested folders or other PRD §2 non-goals are in scope.

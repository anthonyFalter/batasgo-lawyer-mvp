import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import {
  assertEncryptionKey,
  encryptBytes,
  encryptText,
  isEncryptedText,
} from "../src/lib/citizen/message-encryption.mjs";

nextEnv.loadEnvConfig(process.cwd());
assertEncryptionKey();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to encrypt stored citizen data.");
}

const sql = neon(databaseUrl);
let encryptedValues = 0;

let cursor = "00000000-0000-0000-0000-000000000000";
while (true) {
  const messages = await sql`
    SELECT id, content FROM citizen_messages
    WHERE id > ${cursor}::uuid ORDER BY id LIMIT 100
  `;
  if (!messages.length) break;
  for (const message of messages) {
    if (!isEncryptedText(message.content)) {
      await sql`UPDATE citizen_messages SET content = ${encryptText(message.content)} WHERE id = ${message.id} AND content = ${message.content}`;
      encryptedValues += 1;
    }
  }
  cursor = messages[messages.length - 1].id;
}

cursor = "00000000-0000-0000-0000-000000000000";
while (true) {
  const conversations = await sql`
    SELECT id, citizen_display_name, subject, last_message_preview FROM citizen_conversations
    WHERE id > ${cursor}::uuid ORDER BY id LIMIT 100
  `;
  if (!conversations.length) break;
  for (const conversation of conversations) {
    const encryptedValuesForConversation = {
      citizenDisplayName: isEncryptedText(conversation.citizen_display_name)
        ? conversation.citizen_display_name
        : encryptText(conversation.citizen_display_name),
      subject: isEncryptedText(conversation.subject)
        ? conversation.subject
        : encryptText(conversation.subject),
      preview: !conversation.last_message_preview || isEncryptedText(conversation.last_message_preview)
        ? conversation.last_message_preview
        : encryptText(conversation.last_message_preview),
    };
    const changed = Number(encryptedValuesForConversation.citizenDisplayName !== conversation.citizen_display_name)
      + Number(encryptedValuesForConversation.subject !== conversation.subject)
      + Number(encryptedValuesForConversation.preview !== conversation.last_message_preview);
    if (!changed) continue;
    await sql`
      UPDATE citizen_conversations
      SET citizen_display_name = ${encryptedValuesForConversation.citizenDisplayName},
          subject = ${encryptedValuesForConversation.subject},
          last_message_preview = ${encryptedValuesForConversation.preview}
      WHERE id = ${conversation.id}
    `;
    encryptedValues += changed;
  }
  cursor = conversations[conversations.length - 1].id;
}

cursor = "00000000-0000-0000-0000-000000000000";
while (true) {
  const handoffs = await sql`
    SELECT id, title, entries FROM citizen_journal_handoffs
    WHERE id > ${cursor}::uuid ORDER BY id LIMIT 100
  `;
  if (!handoffs.length) break;
  for (const handoff of handoffs) {
    const encryptedTitle = isEncryptedText(handoff.title) ? handoff.title : encryptText(handoff.title);
    const entriesAreEncrypted = typeof handoff.entries === "string" && isEncryptedText(handoff.entries);
    const encryptedEntries = entriesAreEncrypted
      ? handoff.entries
      : encryptText(JSON.stringify(handoff.entries));
    if (encryptedTitle === handoff.title && entriesAreEncrypted) continue;
    await sql`
      UPDATE citizen_journal_handoffs
      SET title = ${encryptedTitle}, entries = ${JSON.stringify(encryptedEntries)}::jsonb
      WHERE id = ${handoff.id}
    `;
    encryptedValues += Number(encryptedTitle !== handoff.title) + Number(!entriesAreEncrypted);
  }
  cursor = handoffs[handoffs.length - 1].id;
}

cursor = "00000000-0000-0000-0000-000000000000";
while (true) {
  const attachments = await sql`
    SELECT id, file_name, encode(content, 'base64') AS content_base64
    FROM citizen_handoff_attachments
    WHERE id > ${cursor}::uuid ORDER BY id LIMIT 100
  `;
  if (!attachments.length) break;
  for (const attachment of attachments) {
    const encryptedFileName = isEncryptedText(attachment.file_name)
      ? attachment.file_name
      : encryptText(attachment.file_name);
    const storedBytes = Buffer.from(attachment.content_base64, "base64");
    const contentIsEncrypted = isEncryptedText(storedBytes.toString("utf8"));
    if (encryptedFileName !== attachment.file_name) {
      await sql`UPDATE citizen_handoff_attachments SET file_name = ${encryptedFileName} WHERE id = ${attachment.id}`;
      encryptedValues += 1;
    }
    if (!contentIsEncrypted) {
      const encryptedContent = encryptBytes(storedBytes);
      await sql`
        UPDATE citizen_handoff_attachments
        SET content = decode(${encryptedContent.toString("base64")}, 'base64')
        WHERE id = ${attachment.id}
      `;
      encryptedValues += 1;
    }
  }
  cursor = attachments[attachments.length - 1].id;
}

console.log(`Encrypted ${encryptedValues} existing citizen message data fields.`);

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";

export const metadata = {
  title: "Messages | ForzaCars Rentals",
};

interface ThreadRow {
  id: string;
  subject: string | null;
  created_by: string;
  customer_id: string | null;
  business_id: string | null;
  last_message_at: string;
  created_at: string;
}

interface MessagePreview {
  id: string;
  thread_id: string;
  body: string;
  sender_id: string;
  recipient_id: string;
  created_at: string;
  read_at: string | null;
}

export default async function MessagesPage() {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  const supabase = await createClient();

  // Fetch threads the user participates in
  const { data: threads } = await supabase
    .from("message_threads")
    .select("*")
    .or(`created_by.eq.${profile.id},customer_id.eq.${profile.id}`)
    .order("last_message_at", { ascending: false })
    .limit(50);

  // Get last message and unread count for each thread
  const threadIds = (threads ?? []).map((t: ThreadRow) => t.id);
  
  let lastMessages: MessagePreview[] = [];
  const unreadCounts: Record<string, number> = {};

  if (threadIds.length > 0) {
    // Fetch last message for each thread
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });

    // Group by thread_id, take first (most recent)
    const messagesByThread: Record<string, MessagePreview> = {};
    for (const msg of (messages ?? []) as MessagePreview[]) {
      if (!messagesByThread[msg.thread_id]) {
        messagesByThread[msg.thread_id] = msg;
      }
      // Count unread for recipient
      if (msg.recipient_id === profile.id && !msg.read_at) {
        unreadCounts[msg.thread_id] = (unreadCounts[msg.thread_id] ?? 0) + 1;
      }
    }
    lastMessages = Object.values(messagesByThread);
  }

  // Build lookup for last message by thread
  const lastMessageMap: Record<string, MessagePreview> = {};
  for (const msg of lastMessages) {
    lastMessageMap[msg.thread_id] = msg;
  }

  // Fetch participant names
  const participantIds = new Set<string>();
  for (const t of threads ?? []) {
    participantIds.add(t.created_by);
    if (t.customer_id) participantIds.add(t.customer_id);
  }
  for (const m of lastMessages) {
    participantIds.add(m.sender_id);
  }

  const { data: participants } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .in("id", Array.from(participantIds));

  const participantMap: Record<string, { email: string; display_name: string | null }> = {};
  for (const p of participants ?? []) {
    participantMap[p.id] = { email: p.email, display_name: p.display_name };
  }

  function getDisplayName(userId: string): string {
    const p = participantMap[userId];
    if (!p) return "Unknown";
    return p.display_name || p.email.split("@")[0];
  }

  function getOtherParticipant(thread: ThreadRow): string {
    if (thread.created_by !== profile!.id) return thread.created_by;
    if (thread.customer_id && thread.customer_id !== profile!.id) return thread.customer_id;
    return thread.created_by;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <Link
          href="/messages/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New Message
        </Link>
      </div>

      {!threads || threads.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No messages yet.</p>
          <p className="mt-2 text-sm text-gray-400">
            Start a conversation with a business or customer.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {(threads as ThreadRow[]).map((thread) => {
            const lastMsg = lastMessageMap[thread.id];
            const unread = unreadCounts[thread.id] ?? 0;
            const otherUserId = getOtherParticipant(thread);
            const otherName = getDisplayName(otherUserId);

            return (
              <Link
                key={thread.id}
                href={`/messages/${thread.id}`}
                className="block px-4 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">
                        {otherName}
                      </span>
                      {unread > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white">
                          {unread}
                        </span>
                      )}
                    </div>
                    {thread.subject && (
                      <p className="text-sm text-gray-600 truncate">
                        {thread.subject}
                      </p>
                    )}
                    {lastMsg && (
                      <p className="mt-1 text-sm text-gray-500 truncate">
                        {lastMsg.sender_id === profile.id ? "You: " : ""}
                        {lastMsg.body.slice(0, 100)}
                        {lastMsg.body.length > 100 ? "…" : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-xs text-gray-400">
                    {new Date(thread.last_message_at).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

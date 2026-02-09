import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { markMessagesAsRead } from "../actions";
import MessageComposer from "./MessageComposer";
import GrantCreditsButton from "./GrantCreditsButton";

export const metadata = {
  title: "Conversation | ForzaCars Rentals",
};

interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

interface Thread {
  id: string;
  subject: string | null;
  created_by: string;
  customer_id: string | null;
  business_id: string | null;
  last_message_at: string;
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  const supabase = await createClient();

  // Fetch thread
  const { data: thread } = await supabase
    .from("message_threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (!thread) {
    notFound();
  }

  const typedThread = thread as Thread;

  // Check if user is participant
  const isParticipant =
    typedThread.created_by === profile.id ||
    typedThread.customer_id === profile.id;

  if (!isParticipant && profile.role !== "ADMIN") {
    // Check if user has any messages in this thread
    const { data: userMessages } = await supabase
      .from("messages")
      .select("id")
      .eq("thread_id", threadId)
      .or(`sender_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
      .limit(1);

    if (!userMessages || userMessages.length === 0) {
      notFound();
    }
  }

  // Fetch messages
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const typedMessages = (messages ?? []) as Message[];

  // Mark messages as read
  await markMessagesAsRead(threadId);

  // Determine the other participant for reply
  const participantIds = new Set<string>();
  participantIds.add(typedThread.created_by);
  if (typedThread.customer_id) participantIds.add(typedThread.customer_id);
  for (const m of typedMessages) {
    participantIds.add(m.sender_id);
    participantIds.add(m.recipient_id);
  }

  // Fetch participant names
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

  // Find the other participant to reply to
  let recipientId = "";
  for (const id of participantIds) {
    if (id !== profile.id) {
      recipientId = id;
      break;
    }
  }

  // If no other participant found, use the last message sender/recipient
  if (!recipientId && typedMessages.length > 0) {
    const lastMsg = typedMessages[typedMessages.length - 1];
    recipientId = lastMsg.sender_id === profile.id ? lastMsg.recipient_id : lastMsg.sender_id;
  }

  // Determine if the current user can grant credits (BUSINESS or ADMIN)
  // and identify a customer to grant to (someone other than themselves)
  const canGrantCredits = profile.role === "BUSINESS" || profile.role === "ADMIN";
  
  // Find a customer to grant credits to (prefer thread customer_id, else other participant)
  let grantTargetId = "";
  let grantTargetName = "";
  if (canGrantCredits && recipientId && recipientId !== profile.id) {
    grantTargetId = recipientId;
    grantTargetName = getDisplayName(recipientId);
  } else if (canGrantCredits && typedThread.customer_id && typedThread.customer_id !== profile.id) {
    grantTargetId = typedThread.customer_id;
    grantTargetName = getDisplayName(typedThread.customer_id);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/messages"
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          &larr; Back to Messages
        </Link>
        <h1 className="mt-2 text-xl font-bold text-gray-900">
          {typedThread.subject || "Conversation"}
        </h1>
        <p className="text-sm text-gray-500">
          with{" "}
          {Array.from(participantIds)
            .filter((id) => id !== profile.id)
            .map((id) => getDisplayName(id))
            .join(", ") || "yourself"}
        </p>

        {/* Grant Credits button for BUSINESS/ADMIN */}
        {canGrantCredits && grantTargetId && (
          <div className="mt-4">
            <GrantCreditsButton
              threadId={threadId}
              recipientId={grantTargetId}
              recipientName={grantTargetName}
            />
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="mb-6 space-y-4">
        {typedMessages.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">No messages in this conversation yet.</p>
          </div>
        ) : (
          typedMessages.map((msg) => {
            const isOwn = msg.sender_id === profile.id;
            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-3 ${
                    isOwn
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  {!isOwn && (
                    <p className="mb-1 text-xs font-medium text-gray-600">
                      {getDisplayName(msg.sender_id)}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  <p
                    className={`mt-1 text-xs ${
                      isOwn ? "text-indigo-200" : "text-gray-400"
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleString()}
                    {isOwn && msg.read_at && (
                      <span className="ml-2">Read</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      {recipientId && (
        <MessageComposer threadId={threadId} recipientId={recipientId} />
      )}
    </div>
  );
}

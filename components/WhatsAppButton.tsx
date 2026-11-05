import { studio } from "@/lib/config";
import { whatsappUrl } from "@/lib/format";
import { Icon } from "./Icons";

// Floating chat button. Many Kenyan clients prefer to ask a question on WhatsApp before booking.
export default function WhatsAppButton() {
  return (
    <a
      className="chat-fab"
      href={whatsappUrl(`Hi ${studio.name}, I'd like to ask about a tattoo.`)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
    >
      <Icon name="chat" size={26} />
    </a>
  );
}

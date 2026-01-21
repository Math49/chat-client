import { useState } from "react";
import { MessageInput } from "@/components/room/message-input";

export function MessageInputHarness() {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [photoName, setPhotoName] = useState("");

  return (
    <div>
      <MessageInput
        value={value}
        onValueChange={setValue}
        onSubmit={setSubmitted}
        onPhotoSelected={(file) => setPhotoName(file.name)}
        placeholder="Envoyer un message..."
      />
      <div data-testid="submitted">{submitted}</div>
      <div data-testid="photo-name">{photoName}</div>
    </div>
  );
}

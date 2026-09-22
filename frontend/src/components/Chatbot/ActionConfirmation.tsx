import { Button } from "@/components/ui/button";

export default function ActionConfirmation({
  disabled,
  onDecide,
}: {
  disabled: boolean;
  onDecide: (confirmed: boolean) => void;
}) {
  return (
    <div className="mt-2 flex gap-2">
      <Button size="sm" disabled={disabled} onClick={() => onDecide(true)}>
        Confirm
      </Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => onDecide(false)}>
        Cancel
      </Button>
    </div>
  );
}
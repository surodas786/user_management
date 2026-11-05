import { useState } from "react";
import { ApiError, errorMessage } from "@/lib/api/core";
import type { FieldErrors } from "@/lib/validation";

interface FormSubmit<K extends string> {
  /** Returns the field errors to show, or nothing when the API call may proceed. */
  validate(): FieldErrors<K>;
  submit(): Promise<void>;
  /** Moves a whole-form API error onto one field, such as a taken email. */
  fieldForCode?: Partial<Record<string, K>>;
}

/** Shared submit lifecycle: validate, call the API, map errors to fields or the form. */
export function useFormSubmit<K extends string>({
  validate,
  submit,
  fieldForCode,
}: FormSubmit<K>) {
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<K>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const errors = validate();
    setFieldErrors(errors);
    setFormError(undefined);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      await submit();
      // Stays pending on success: the page is navigating away.
    } catch (error) {
      setPending(false);
      const field =
        error instanceof ApiError ? fieldForCode?.[error.code] : undefined;
      if (field) {
        setFieldErrors({ [field]: errorMessage(error) } as FieldErrors<K>);
      } else if (error instanceof ApiError && error.details?.length) {
        setFieldErrors(
          Object.fromEntries(
            error.details.map(({ field: name, message }) => [name, message]),
          ) as FieldErrors<K>,
        );
        setFormError(errorMessage(error));
      } else {
        setFormError(errorMessage(error));
      }
    }
  }

  return { pending, formError, fieldErrors, onSubmit };
}

import { saveReview } from "@/lib/engagement-actions";
import { FormSubmit } from "@/components/form-submit";

export function CustomerReviewForm({
  appointmentId,
  rating,
  comment,
}: {
  appointmentId: string;
  rating?: number;
  comment?: string | null;
}) {
  return (
    <form action={saveReview} className="stack customer-review-form">
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <input type="hidden" name="return_to" value="/cliente?tab=avaliacoes" />
      <label className="field">
        Sua nota
        <select name="rating" defaultValue={rating || ""} required>
          <option value="" disabled>
            Selecione de 1 a 5 estrelas
          </option>
          {[5, 4, 3, 2, 1].map((value) => (
            <option value={value} key={value}>
              {value} {value === 1 ? "estrela" : "estrelas"}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Comentário <span className="muted">(opcional)</span>
        <textarea
          name="comment"
          maxLength={1000}
          rows={3}
          defaultValue={comment || ""}
        />
      </label>
      <small className="muted">
        Sua nota, comentário e nome de usuário ou primeiro nome aparecerão no
        perfil público da empresa. Evite informações pessoais ou sensíveis.
      </small>
      <FormSubmit secondary>
        {rating ? "Atualizar avaliação" : "Publicar avaliação"}
      </FormSubmit>
    </form>
  );
}

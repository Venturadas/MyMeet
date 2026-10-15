import type { Business, BusinessHours, Service } from "@/lib/types";
import { money } from "@/lib/types";
import { saveBusiness, saveHours, saveService } from "@/lib/actions";
import {
  deleteProfessional,
  saveCompanyProfile,
  saveProfessional,
} from "@/lib/company-actions";
import { FormSubmit } from "@/components/form-submit";
import { MediaUploader } from "@/components/media-uploader";
import { MediaImage } from "@/components/media-image";

export type CompanyProfessional = {
  id: string;
  name: string;
  title: string;
  active: boolean;
  photo_path: string | null;
};

export function CompanyCreationForm() {
  return (
    <form className="stack company-form setup-form" action={saveBusiness}>
      <label className="field">
        Nome da empresa
        <input
          name="name"
          minLength={2}
          maxLength={100}
          autoComplete="organization"
          required
        />
      </label>
      <small className="muted">
        O link da sua agenda será criado automaticamente.
      </small>
      <FormSubmit>Criar empresa</FormSubmit>
    </form>
  );
}

export function CompanyServiceForm({ service }: { service?: Service }) {
  return (
    <form className="stack service-form company-form" action={saveService}>
      {service && <input type="hidden" name="service_id" value={service.id} />}
      <label className="field">
        Nome do serviço
        <input
          name="name"
          minLength={2}
          maxLength={100}
          defaultValue={service?.name}
          required
        />
      </label>
      <div className="grid-2">
        <label className="field">
          Duração (minutos)
          <input
            type="number"
            name="duration_minutes"
            min={15}
            max={480}
            step={15}
            defaultValue={service?.duration_minutes || 30}
            required
          />
        </label>
        <label className="field">
          Preço (R$)
          <input
            name="price"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={service ? (service.price_cents / 100).toFixed(2) : ""}
            pattern="[0-9]{1,6}([.,][0-9]{1,2})?"
            required
          />
        </label>
      </div>
      <label className="field">
        Descrição <small className="muted">Opcional</small>
        <textarea
          name="description"
          maxLength={500}
          defaultValue={service?.description}
          rows={2}
        />
      </label>
      {service ? (
        <label className="inline">
          <input
            type="checkbox"
            name="active"
            defaultChecked={service.active}
          />
          Disponível para agendar
        </label>
      ) : (
        <input type="hidden" name="active" value="on" />
      )}
      <FormSubmit>
        {service ? "Salvar serviço" : "Adicionar serviço"}
      </FormSubmit>
    </form>
  );
}

export function CompanyServices({ services }: { services: Service[] }) {
  return (
    <div className="stack">
      <details className="settings-section" open={!services.length}>
        <summary>Adicionar serviço</summary>
        <CompanyServiceForm />
      </details>
      {services.length ? (
        <div className="service-list">
          {services.map((service) => (
            <details className="service-row" key={service.id}>
              <summary>
                <span>{service.name}</span>
                <small>
                  {service.duration_minutes} min · {money(service.price_cents)}
                  {!service.active ? " · indisponível" : ""}
                </small>
              </summary>
              <CompanyServiceForm service={service} />
            </details>
          ))}
        </div>
      ) : (
        <p className="muted">
          Adicione seu primeiro serviço para começar a receber reservas.
        </p>
      )}
    </div>
  );
}

export function CompanyHoursForm({ hours }: { hours: BusinessHours[] }) {
  const weekdays = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];
  return (
    <form className="stack company-form" action={saveHours}>
      <small className="muted">
        Horário de Brasília · intervalos de 15 minutos.
      </small>
      {weekdays.map((day, index) => {
        const current = hours.find((hour) => hour.weekday === index);
        return (
          <div className="hours-row" key={day}>
            <label className="inline">
              <input
                name={`day_${index}`}
                type="checkbox"
                defaultChecked={Boolean(current)}
              />
              {day}
            </label>
            <label className="field">
              Início
              <input
                name={`start_${index}`}
                type="time"
                step={900}
                defaultValue={current?.start_time.slice(0, 5) || "09:00"}
                required
              />
            </label>
            <label className="field">
              Fim
              <input
                name={`end_${index}`}
                type="time"
                step={900}
                defaultValue={current?.end_time.slice(0, 5) || "18:00"}
                required
              />
            </label>
          </div>
        );
      })}
      <FormSubmit>Salvar horários</FormSubmit>
    </form>
  );
}

export function CompanyProfileForm({ business }: { business: Business }) {
  return (
    <form className="stack company-form" action={saveCompanyProfile}>
      <div className="grid-2">
        <label className="field">
          Nome da empresa
          <input
            name="name"
            minLength={2}
            maxLength={100}
            defaultValue={business.name}
            autoComplete="organization"
            required
          />
        </label>
        <label className="field">
          Categoria
          <input
            name="category"
            maxLength={80}
            defaultValue={business.category || ""}
            placeholder="Ex.: Beleza, saúde, consultoria"
          />
        </label>
      </div>
      <label className="field">
        Sobre a empresa
        <textarea
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={business.description}
        />
      </label>
      <label className="field">
        Link da agenda
        <input
          name="slug"
          minLength={3}
          maxLength={60}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          defaultValue={business.slug}
          required
        />
        <small>Letras minúsculas, números e hífens.</small>
      </label>
      <fieldset className="stack">
        <legend>Localização</legend>
        <label className="field">
          Endereço
          <input
            name="address"
            maxLength={240}
            autoComplete="street-address"
            defaultValue={business.address || ""}
          />
        </label>
        <div className="grid-2">
          <label className="field">
            Cidade
            <input
              name="city"
              maxLength={100}
              autoComplete="address-level2"
              defaultValue={business.city || ""}
            />
          </label>
          <label className="field">
            Estado
            <select
              name="state"
              autoComplete="address-level1"
              defaultValue={business.state || ""}
            >
              <option value="">Selecione</option>
              {[
                "AC",
                "AL",
                "AP",
                "AM",
                "BA",
                "CE",
                "DF",
                "ES",
                "GO",
                "MA",
                "MT",
                "MS",
                "MG",
                "PA",
                "PB",
                "PR",
                "PE",
                "PI",
                "RJ",
                "RN",
                "RS",
                "RO",
                "RR",
                "SC",
                "SP",
                "SE",
                "TO",
              ].map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset className="stack">
        <legend>Contato público</legend>
        <div className="grid-2">
          <label className="field">
            Telefone
            <input
              type="tel"
              inputMode="tel"
              name="phone"
              maxLength={24}
              autoComplete="tel"
              defaultValue={business.phone || ""}
            />
          </label>
          <label className="field">
            WhatsApp
            <input
              type="tel"
              inputMode="tel"
              name="whatsapp"
              maxLength={24}
              defaultValue={business.whatsapp || ""}
              placeholder="55 + DDD + número"
            />
          </label>
        </div>
        <label className="field">
          Instagram
          <input
            name="instagram"
            maxLength={31}
            defaultValue={business.instagram || ""}
            placeholder="@suaempresa"
          />
        </label>
      </fieldset>
      <FormSubmit>Salvar perfil</FormSubmit>
    </form>
  );
}

function ProfessionalForm({
  professional,
}: {
  professional?: CompanyProfessional;
}) {
  return (
    <form className="stack company-form" action={saveProfessional}>
      {professional && (
        <input type="hidden" name="professional_id" value={professional.id} />
      )}
      <div className="grid-2">
        <label className="field">
          Nome
          <input
            name="name"
            minLength={2}
            maxLength={100}
            defaultValue={professional?.name}
            required
          />
        </label>
        <label className="field">
          Função
          <input
            name="title"
            maxLength={120}
            defaultValue={professional?.title}
            placeholder="Ex.: Cabeleireira"
          />
        </label>
      </div>
      {professional ? (
        <label className="inline">
          <input
            name="active"
            type="checkbox"
            defaultChecked={professional.active}
          />
          Exibir no perfil público
        </label>
      ) : (
        <input type="hidden" name="active" value="on" />
      )}
      <FormSubmit>
        {professional ? "Salvar profissional" : "Adicionar profissional"}
      </FormSubmit>
    </form>
  );
}

export function CompanyProfessionals({
  professionals,
}: {
  professionals: CompanyProfessional[];
}) {
  return (
    <section className="stack" aria-labelledby="professionals-heading">
      <h2 id="professionals-heading">Profissionais</h2>
      <details className="settings-section">
        <summary>Adicionar profissional</summary>
        <ProfessionalForm />
      </details>
      <div className="company-list">
        {professionals.map((professional) => (
          <details className="settings-section" key={professional.id}>
            <summary className="company-person-row">
              <MediaImage
                path={professional.photo_path}
                alt={`Foto de ${professional.name}`}
                fallback={professional.name}
                width={48}
                height={48}
                className="company-person-photo"
              />
              <span>
                <strong>{professional.name}</strong>
                <small className="muted">
                  {professional.title}
                  {!professional.active ? " · oculto" : ""}
                </small>
              </span>
            </summary>
            <div className="stack">
              <ProfessionalForm professional={professional} />
              <MediaUploader
                kind="professional"
                professionalId={professional.id}
                currentPath={professional.photo_path}
                label={`Foto de ${professional.name}`}
              />
              <form action={deleteProfessional}>
                <input
                  type="hidden"
                  name="professional_id"
                  value={professional.id}
                />
                <FormSubmit secondary pendingLabel="Removendo…">
                  Remover profissional
                </FormSubmit>
              </form>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

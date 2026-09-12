"use client";

// Shared proposal form for new polling units — used by both the admin
// Geography surface (/pu-requests/new) and the field app
// (/field/propose-pu). GPS is mandatory: capture from the device or drop a
// pin on the mini map.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, MapPinPlus, Navigation } from "lucide-react";
import { geographyApi, puRequestsApi } from "@/lib/api";
import { useConnectivity } from "@/lib/connectivity";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { apiErrorMessage } from "@/lib/http";
import LocationPicker from "@/components/map/LocationPicker";
import type { LGA, Ward } from "@/types";

export function PURequestForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const { online } = useConnectivity();
  const { push } = useToast();

  const [lgas, setLgas] = useState<LGA[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [lgaId, setLgaId] = useState("");
  const [wardId, setWardId] = useState("");
  const [officialCode, setOfficialCode] = useState("");
  const [name, setName] = useState("");
  const [locationDescription, setLocationDescription] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    geographyApi
      .lgas()
      .then((res) => setLgas(Array.isArray(res) ? res : []))
      .catch(() => setLgas([]));
  }, []);

  useEffect(() => {
    if (!lgaId) {
      setWards([]);
      return;
    }
    geographyApi
      .wards(lgaId)
      .then((res) => setWards(Array.isArray(res) ? res : []))
      .catch(() => setWards([]));
    setWardId("");
  }, [lgaId]);

  const captureGps = () => {
    if (!("geolocation" in navigator)) {
      push("error", "GPS is not available on this device.");
      return;
    }
    push("info", "Locating…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        push("success", "GPS position captured.");
      },
      () => push("error", "Couldn't get a GPS fix — drop a pin on the map instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wardId || !officialCode.trim() || !name.trim() || !lat || !lng) return;
    setSubmitting(true);
    try {
      await puRequestsApi.create({
        ward: wardId,
        official_code: officialCode.trim(),
        name: name.trim(),
        location_description: locationDescription.trim(),
        latitude: lat,
        longitude: lng,
        source_note: sourceNote.trim(),
      });
      push("success", "Proposal submitted for review.");
      router.push(redirectTo);
    } catch (err) {
      push("error", apiErrorMessage(err, "Couldn't submit the proposal."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Propose New Polling Unit"
        description="Flag a missing unit for review — approved proposals join the official registry."
      />
      <Card bodyClassName="p-5">
        <form onSubmit={submit} className="space-y-4">
          {!online && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <CloudOff size={14} /> You&apos;re offline — proposals need a connection.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="LGA">
              <Select value={lgaId} onChange={(e) => setLgaId(e.target.value)} required>
                <option value="">Select LGA…</option>
                {lgas.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Ward">
              <Select value={wardId} onChange={(e) => setWardId(e.target.value)} disabled={!lgaId} required>
                <option value="">{lgaId ? "Select ward…" : "Pick an LGA first"}</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Official code" hint="INEC reference for the new unit">
              <Input value={officialCode} onChange={(e) => setOfficialCode(e.target.value)} required placeholder="e.g. YB/DTR/1023" />
            </Field>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Kaleri Dispensary" />
            </Field>
          </div>

          <Field label="Location description" hint="Landmarks help reviewers find it">
            <Input
              value={locationDescription}
              onChange={(e) => setLocationDescription(e.target.value)}
              placeholder="e.g. Beside the primary school"
            />
          </Field>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">GPS location</span>
              <Button type="button" variant="secondary" size="sm" onClick={captureGps}>
                <Navigation size={13} /> Capture GPS
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude">
                <Input value={lat} onChange={(e) => setLat(e.target.value)} required inputMode="decimal" placeholder="12.345678" />
              </Field>
              <Field label="Longitude">
                <Input value={lng} onChange={(e) => setLng(e.target.value)} required inputMode="decimal" placeholder="11.123456" />
              </Field>
            </div>
            <LocationPicker
              lat={lat}
              lng={lng}
              onChange={(a, b) => {
                setLat(a);
                setLng(b);
              }}
              className="mt-3 h-64"
            />
          </div>

          <Field label="Note to reviewers" hint="Optional context, e.g. how the unit was discovered">
            <Textarea
              value={sourceNote}
              onChange={(e) => setSourceNote(e.target.value)}
              rows={3}
              placeholder="e.g. Newly commissioned community unit confirmed during field survey"
            />
          </Field>

          <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!online}>
            <MapPinPlus size={16} /> Submit proposal
          </Button>
        </form>
      </Card>
    </div>
  );
}
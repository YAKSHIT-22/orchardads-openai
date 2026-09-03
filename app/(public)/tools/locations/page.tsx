"use client";

/**
 * Location lookup.
 *
 * Finds the location ids that go into `campaign.targeting.locations.include`
 * (up to 2,500 per campaign).
 *
 * `GET /geo_lookup/search` accepts exactly two parameters, `q` and `limit`.
 * There is no entity-type filter, no country filter and no cursor, so this page
 * offers none: a control that can't reach the API is worse than no control.
 * The type and country come back *on each result* and are shown as columns, so
 * you filter by reading, not by guessing.
 */

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adAccountStore } from "@/stores/adAccountStore";
import { Loader2, Copy, MapPin } from "lucide-react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { useGeoSearch } from "@/stores/geoSearchStore";
import type { GeoLocationResult } from "@/types/geoDetails";
import axios from "axios";

const PAGE_SIZE = 10;
/** The endpoint's own ceiling (spec: limit maximum 100). */
const SEARCH_LIMIT = 100;

const querySchema = z.object({
  query: z.string().trim().min(2, "Enter at least two characters to search"),
});

type SearchQuery = z.infer<typeof querySchema>;

export default function LocationsPage() {
  const [page, setPage] = useState(0);
  const { query, setQuery, setResults, getCurrentResults, clear } = useGeoSearch();
  const { adAccountId } = adAccountStore();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SearchQuery>({
    resolver: zodResolver(querySchema),
    defaultValues: { query: query || "" },
  });

  const hasHydrated = useGeoSearch.persist?.hasHydrated();
  useEffect(() => {
    if (hasHydrated) reset({ query });
  }, [hasHydrated, reset, query]);

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: SearchQuery) => {
      if (!adAccountId) throw new Error("Connect an ad account first");
      const res = await api.post("/geolocations/searchlocations", {
        q: data.query,
        limit: SEARCH_LIMIT,
        adAccountId,
      });
      return (res.data?.locations ?? []) as GeoLocationResult[];
    },
    onSuccess: (locations, vars) => {
      setQuery(vars.query);
      setResults(adAccountId, locations);
      setPage(0);
      if (locations.length === 0) toast.info(`No locations match “${vars.query}”`);
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message || err.message
        : err instanceof Error
          ? err.message
          : "Search failed";
      toast.error(msg);
    },
  });

  const handleClear = () => {
    clear();
    reset({ query: "" });
    setPage(0);
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success(`Copied ${id}`);
  };

  const allResults = getCurrentResults(adAccountId);
  const totalResults = allResults.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const startIndex = page * PAGE_SIZE;
  const currentPage = allResults.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <section className="w-full p-4 md:p-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              Locations
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Search targetable locations and copy their ids into a campaign&apos;s
              targeting. A campaign accepts up to 2,500.
            </p>
          </div>

          <form
            onSubmit={handleSubmit((d) => mutate(d))}
            className="flex flex-wrap gap-2 items-start md:justify-end"
          >
            <div className="flex flex-col">
              <Input
                {...register("query")}
                placeholder="Search locations — city, region or country"
                className="w-72"
                aria-invalid={!!errors.query}
              />
              {errors.query && (
                <span className="text-xs text-destructive mt-1">
                  {errors.query.message}
                </span>
              )}
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching…
                </>
              ) : (
                "Search"
              )}
            </Button>
            <Button type="button" variant="outline" onClick={handleClear}>
              Clear
            </Button>
          </form>
        </div>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Region</TableHead>
                <TableHead className="text-right">ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentPage.length > 0 ? (
                currentPage.map((geo) => (
                  <TableRow key={geo.id}>
                    <TableCell>
                      <div className="font-medium">{geo.name}</div>
                      {geo.canonical_name && geo.canonical_name !== geo.name && (
                        <div className="text-xs text-muted-foreground">
                          {geo.canonical_name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {String(geo.type || "").replace(/_/g, " ") || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>{geo.country_code || "—"}</TableCell>
                    <TableCell>{geo.region_code || "—"}</TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => copyId(geo.id)}
                        className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-foreground text-muted-foreground"
                        title="Copy location id"
                      >
                        {geo.id}
                        <Copy className="h-3 w-3" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10">
                    {isPending ? (
                      <div className="flex justify-center items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading…</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        Search above to find targetable locations.
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {totalResults > 0 && (
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1}–
              {Math.min(startIndex + PAGE_SIZE, totalResults)} of {totalResults}
              {totalResults === SEARCH_LIMIT && " (capped — narrow your search)"}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page + 1 >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

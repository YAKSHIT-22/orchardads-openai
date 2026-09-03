"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adAccountStore } from "@/stores/adAccountStore";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { midLimit } from "@/utils/variableConstant";
import { Controller, useForm } from "react-hook-form";
import { formatGeoEntity } from "@/utils/globalConstants";
import { useGeoSearch } from "@/stores/geoSearchStore";
import SingleCountrySelect from "@/components/user/singleCountrySelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import axios, { AxiosError } from "axios";

const PAGE_SIZE = 10;
const entityList = ["AdminArea", "Locality", "Country"] as const;

const querySchema = z.object({
  query: z
    .string()
    .trim()
    .refine((val) => val === "" || val.length >= 3, {
      message: "Query must be at least 3 characters long",
    }),
  countrycode: z.string().min(1, "Select one"),
  entity: z.enum(entityList),
});

type searchQuery = z.infer<typeof querySchema>;

export default function AppSearchPage() {
  const [page, setPage] = useState(0);
  const [isNextDisabled, setNextDisabled] = useState(false);
  const [isLastPage, setIsLastPage] = useState(0);

  const {
    query,
    entity,
    countrycode,
    results,
    offset,
    incrementOffset,
    resetOffset,
    setQuery,
    addResults,
    getCurrentResults,
    clear,
  } = useGeoSearch();

  const { adAccountId } = adAccountStore();
  const {
    register,
    handleSubmit,
    reset,
    control,
    clearErrors,
    formState: { errors },
  } = useForm<searchQuery>({
    resolver: zodResolver(querySchema),
    defaultValues: {
      query: query || "",
      entity: entity,
      countrycode: countrycode,
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: searchQuery) => {
      if (!adAccountId) throw new Error("ACL response is not available");
      const res = await api.post("/geolocations/searchlocations", {
        query: data.query,
        limit: midLimit,
        offset,
        entity: data.entity,
        countrycode: data.countrycode,
        adAccountId: adAccountId,
      });
      return res.data.searchgeo_results;
    },
    onSuccess: ({ data, error }, { entity, countrycode }) => {
      if ((!data || data.length === 0) && (!error || !error.messageCode)) {
        toast.info("No search results found");
        setIsLastPage(totalPages);
        setNextDisabled(true);
        return;
      }
      addResults(adAccountId, offset, entity, countrycode, data);
      setNextDisabled(false);
      toast.success("Search completed successfully");
    },
    onError: (err) => {
      let finalMsg = "Error occurred while searching";
      if (axios.isAxiosError(err)) {
        const axiosErr = err as AxiosError;
        //@ts-ignore
        const apiMsg = axiosErr.response?.data?.res[0]?.message;
        finalMsg = apiMsg || axiosErr.message || finalMsg;
      } else if (err instanceof Error) {
        finalMsg = err.message;
      }
      toast.error(finalMsg);
    },
  });

  const onValid = (data: searchQuery) => {
    clear();
    setQuery(data.query ? data.query : "", data.entity, data.countrycode);
    setPage(0);
    resetOffset();
    setIsLastPage(0);
    mutate(data);
  };

  const onInvalid = (formErrors: Record<string, any>) => {
    const msg = formErrors.query?.message;
    const entity = formErrors.entity?.message;
    const countrycode = formErrors.countrycode?.message
    if (msg) toast.error(msg);
    if (entity) toast.error(entity);
    if (countrycode) toast.error(countrycode);
  };

  const handleClear = () => {
    clear();
    reset({ query: "", entity: "AdminArea", countrycode: "US" });
    clearErrors();
    setPage(0);
  };

  const handlePrev = () => {
    if (page > 0) {
      setPage((p) => Math.max(0, p - 1));
      setNextDisabled(false);
    } else {
      toast.info("No previous page");
    }
  };

  const handleNext = () => {
    const startIndex = page * PAGE_SIZE;
    const allResults = getCurrentResults(adAccountId);
    if (page + 1 === isLastPage) {
      setNextDisabled(true);
      toast.info("No more pages");
      return;
    }
    if (startIndex + PAGE_SIZE < allResults.length && !isNextDisabled) {
      setPage((p) => p + 1);
    } else {
      incrementOffset();
      mutate({
        query,
        entity: entity,
        countrycode,
      });
    }
  };

  const hasHydrated = useGeoSearch.persist?.hasHydrated();

  useEffect(() => {
    if (!hasHydrated) return;
    reset({
      query: query,
      entity: entity,
      countrycode: countrycode,
    });
    clearErrors();
  }, [hasHydrated, reset, clearErrors, query, entity, countrycode]);

  const allResults = getCurrentResults(adAccountId);
  const totalResults = allResults.length || 0;
  const startIndex = page * PAGE_SIZE;
  const currentPage = allResults.slice(startIndex, startIndex + PAGE_SIZE);
  const totalPages = Math.ceil(totalResults / PAGE_SIZE);

  return (
    <>
      <section className="w-full p-4 md:p-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">
                Search for Geo Locations
              </h1>
              <p className="text-sm text-muted-foreground">
                Search geolocations to use for campaign targeting.
              </p>
            </div>

            <div className="flex items-end justify-end flex-col gap-2">
              <form
                onSubmit={handleSubmit(onValid, onInvalid)}
                className="flex flex-wrap gap-2 items-center md:justify-end"
              >
                <Input
                  {...register("query")}
                  placeholder="Enter geo location or keyword"
                  className="w-60"
                />
                <Controller
                  control={control}
                  name="entity"
                  render={({ field }) => (
                    <>
                      <Select
                        value={field.value}
                        onValueChange={(val) => field.onChange(val)}
                      >
                        <SelectTrigger className="">
                          {formatGeoEntity[field.value]}
                        </SelectTrigger>
                        <SelectContent>
                          {entityList.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {formatGeoEntity[opt]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                />
                <Controller
                  control={control}
                  name="countrycode"
                  render={({ field }) => (
                    <SingleCountrySelect
                      value={field.value}
                      onChange={field.onChange}
                      className={"w-60"}
                      error={errors.countrycode?.message}
                    />
                  )}
                />
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Searching...</span>
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
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 py-2 border-r">ID</TableHead>
                  <TableHead className="px-4 py-2 border-l border-r">
                    Display Name
                  </TableHead>
                  <TableHead className="px-4 py-2 border-l border-r">
                    Entity
                  </TableHead>
                  <TableHead className="px-4 py-2 border-l border-r">
                    Country
                  </TableHead>
                  <TableHead className="px-4 py-2 border-l ">
                    Admin Area
                  </TableHead>
                  <TableHead className="px-4 py-2 border-l ">
                    Locality
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentPage.length > 0 ? (
                  currentPage.map((geo) => (
                    <TableRow key={geo.id}>
                      <TableCell className="px-4 py-2 border-r">
                        <div className="flex items-center gap-2">{geo.id}</div>
                      </TableCell>
                      <TableCell className="px-4 py-2 border-r">
                        <div className="flex items-center gap-2">{geo.name}</div>
                      </TableCell>
                      <TableCell className="max-w-xs px-4 py-2 border-l border-r">
                        <div className="flex items-center gap-2 capitalize">{geo.type}</div>
                      </TableCell>
                      <TableCell className="max-w-xs px-4 py-2 border-l border-r">
                        <div className="flex items-center gap-2">{geo.country_code || "\u2014"}</div>
                      </TableCell>
                      <TableCell className="px-4 py-2 border-l">
                        <div className="flex items-center gap-2">{geo.region_code || "\u2014"}</div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6">
                      {isPending ? (
                        <div className="flex justify-center items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading...</span>
                        </div>
                      ) : (
                        "No geolocations found — try a search above"
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {currentPage.length > 0 && (
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to{" "}
                {Math.min(startIndex + PAGE_SIZE, totalResults)} of{" "}
                {totalResults} results
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  disabled={page === 0 || isPending}
                >
                  Previous
                </Button>
                <span className="text-sm">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={
                    page + 1 > totalPages || isPending || isNextDisabled
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

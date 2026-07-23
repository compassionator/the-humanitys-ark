(function initializeArkSeekJobsAdapter(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ARK_SEEK_JOBS_ADAPTER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSeekJobsAdapterModule() {
  const DEFAULT_PROFILE = {
      id: "seek_jobs_default_profile",
      adapter_id: "seek_jobs",
      version: "v2026.06.005d",
      display_name: "SEEK Jobs Default Profile",
      item_type: "job",
      fields: {
        detail_root: [
          "[data-automation=\"job-details-page\"]",
          "[data-automation=\"job-detail\"]",
          "[data-automation=\"splitViewJobDetailsWrapper\"]",
          "main"
        ],
        fallback_root: [
          "main",
          "body"
        ],
        title: [
          "[data-automation=\"job-detail-title\"]",
          "[data-automation=\"job-detail-title\"] h1",
          "[data-automation=\"jobTitle\"]",
          "h1"
        ],
        company: [
          "[data-automation=\"advertiser-name\"]",
          "[data-automation=\"job-detail-company\"]",
          "[data-automation=\"company-name\"]",
          "[data-automation=\"jobCompany\"]"
        ],
        location: [
          "[data-automation=\"job-detail-location\"]",
          "[data-automation=\"job-detail-location\"] a",
          "[data-automation=\"job-location\"]",
          "[data-automation=\"jobLocation\"]",
          "[data-automation=\"jobCardLocation\"]"
        ],
        posted: [
          "[data-automation=\"job-detail-date\"]",
          "[data-automation=\"job-detail-listed-date\"]",
          "[data-automation=\"jobListingDate\"]"
        ],
        work_type: [
          "[data-automation=\"job-detail-work-type\"]",
          "[data-automation=\"job-detail-work-arrangement\"]"
        ],
        salary: [
          "[data-automation=\"job-detail-salary\"]",
          "[data-automation=\"job-salary\"]",
          "[data-automation=\"jobSalary\"]"
        ],
        classification: [
          "[data-automation=\"job-detail-classifications\"]",
          "[data-automation=\"job-classification\"]",
          "[data-automation=\"jobClassification\"]",
          "[data-automation=\"jobSubClassification\"]",
          "[data-automation=\"searchClassification\"]"
        ],
        description: [
          "[data-automation=\"jobAdDetails\"]",
          "[data-automation=\"job-ad-details\"]",
          "[data-automation=\"job-detail-description\"]",
          "[data-automation=\"jobShortDescription\"]"
        ],
        apply_button: [
          "[data-automation=\"job-detail-apply\"]",
          "a[href*=\"/job/\"][href*=\"apply\"]",
          "a[href*=\"apply\"]",
          "button"
        ],
        recommendation_link: [
          "a[href*=\"/job/\"]"
        ]
      },
      job_id: {
        url_patterns: [
          "/job/<id>"
        ],
        query_params: [
          "jobId"
        ],
        link_selectors: [
          "a[href*=\"/job/\"]"
        ]
      },
      readiness: {
        min_description_length: 50,
        allow_applied_without_description: false
      }
    };
  function create(context = {}) {
    const { adapterDiagnostics, buildExtractedJob, console, document, domUtils, extractionResults,
      jobAdapterResult, jobCompatibility, location, normalize, sourceAdaptersRuntime } = context;
    if (!adapterDiagnostics || !buildExtractedJob || !document || !domUtils || !extractionResults ||
      !jobAdapterResult || !jobCompatibility || !location || !sourceAdaptersRuntime)
      throw new Error("SEEK Jobs adapter dependencies were not provided.");
    const cleanText=domUtils.cleanText;

    function selectorsFromProfile(profile, section, fallback = []) { return domUtils.selectorsFromProfile(getSeekProfile(profile), section, fallback); }
    function safeQuerySelector(root, selector) { return domUtils.safeQuerySelector(root, selector, ({ error }) => console.warn("[ARK Lens] invalid selector skipped", { selector, error })); }
    function safeQuerySelectorAll(root, selector) { return domUtils.safeQuerySelectorAll(root, selector, ({ error }) => console.warn("[ARK Lens] invalid selector skipped", { selector, error })); }
    function firstMatchSelector(selectors){return domUtils.firstMatchSelector(document,selectors);}
    function getFallbackRoot(profile){return firstMatchSelector(selectorsFromProfile(profile,"fallback_root",["main"]));}
    function getScopedRoots(profile){const root=getFallbackRoot(profile);return root?[root]:[];}
    function firstScopedText(selectors,minimumLength=1,profile){return domUtils.firstText(getScopedRoots(profile),selectors,minimumLength);}
    function getSeekJobIdFromHref(href){return (href||"").match(/\/job\/(\d+)/)?.[1]||null;}
    function getCurrentJobIdParam(href,profile){return domUtils.getCurrentItemIdParam(href,getSeekProfile(profile),location.href);}
    function isSeekJobsPage(){return sourceAdaptersRuntime.definitionMatchesLocation(sourceAdaptersRuntime.getAdapterDefinition("seek_jobs"),location);}

    function getSeekProfile(profile) {
      return profile || DEFAULT_PROFILE;
    }

    function getSeekJobIdFromUrlOrLinks(profile) {
      const currentJobId = getCurrentJobIdParam(location.href, profile);
      if (currentJobId) return currentJobId;

      const urlJobId = getSeekJobIdFromHref(location.href);
      if (urlJobId) return urlJobId;

      const linkSelectors = getSeekProfile(profile)?.job_id?.link_selectors || [
        "a[href*=\"/job/\"]"
      ];

      for (const root of getScopedRoots(profile)) {
        for (const selector of linkSelectors) {
          const selectedLink = safeQuerySelector(root, selector);
          const href = selectedLink?.href || "";
          const hrefMatch = getSeekJobIdFromHref(href) || getCurrentJobIdParam(href, profile);

          if (hrefMatch) return hrefMatch;
        }
      }

      return null;
    }

    function extractJsonObjectAfterMarker(text, marker) {
      const markerIndex = text.indexOf(marker);

      if (markerIndex < 0) {
        return null;
      }

      const start = text.indexOf("{", markerIndex);

      if (start < 0) {
        return null;
      }

      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let index = start; index < text.length; index += 1) {
        const char = text[index];

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === "\\") {
            escaped = true;
          } else if (char === "\"") {
            inString = false;
          }

          continue;
        }

        if (char === "\"") {
          inString = true;
        } else if (char === "{") {
          depth += 1;
        } else if (char === "}") {
          depth -= 1;

          if (depth === 0) {
            return text.slice(start, index + 1);
          }
        }
      }

      return null;
    }

    function getSeekApolloData() {
      const scripts = safeQuerySelectorAll(document, "script");

      for (const script of scripts) {
        const text = script.textContent || "";

        if (!text.includes("window.SEEK_APOLLO_DATA")) {
          continue;
        }

        const jsonText = extractJsonObjectAfterMarker(text, "window.SEEK_APOLLO_DATA");

        if (!jsonText) {
          continue;
        }

        try {
          return JSON.parse(jsonText);
        } catch (error) {
          console.warn("[ARK Lens] SEEK Apollo data parse failed", error);
        }
      }

      return null;
    }

    function resolveSeekRef(data, value) {
      if (Array.isArray(value)) {
        return value.map((item) => resolveSeekRef(data, item));
      }

      if (value && typeof value === "object" && value.__ref) {
        return resolveSeekRef(data, data[value.__ref]);
      }

      return value;
    }

    function getSeekListingDateLabel(listingDate) {
      if (!listingDate || typeof listingDate !== "object") {
        return "";
      }

      const labelKey = Object.keys(listingDate).find((key) => key.startsWith("label("));
      return cleanText(listingDate.label || listingDate[labelKey] || "");
    }

    function findSeekApolloJob(jobId) {
      const data = getSeekApolloData();

      if (!data || !jobId) {
        return null;
      }

      const values = Object.values(data);
      return values.find((value) =>
        value &&
        typeof value === "object" &&
        value.__typename === "JobSearchV6Data" &&
        (String(value.id || "") === String(jobId) ||
          String(value.solMetadata?.jobId || "") === String(jobId))
      ) || null;
    }

    function getSeekClassificationText(job) {
      const data = getSeekApolloData();
      const classifications = resolveSeekRef(data, job?.classifications || []);
      const labels = [];

      classifications.forEach((item) => {
        const classification = resolveSeekRef(data, item?.classification);
        const subclassification = resolveSeekRef(data, item?.subclassification);

        if (classification?.description) {
          labels.push(classification.description);
        }

        if (subclassification?.description) {
          labels.push(subclassification.description);
        }
      });

      return labels.filter(Boolean).join(" · ");
    }

    function getSeekApolloJobFields(jobId) {
      const job = findSeekApolloJob(jobId);

      if (!job) {
        return null;
      }

      const locations = resolveSeekRef(getSeekApolloData(), job.locations || []);
      const posted = getSeekListingDateLabel(job.listingDate);
      const locationText = locations.map((item) => item?.label).filter(Boolean).join(" · ");
      const workType = (job.workTypes || []).filter(Boolean).join(" · ");
      const salary = cleanText(job.salaryLabel || "");
      const classification = getSeekClassificationText(job);
      const description = cleanText([
        job.teaser,
        ...(job.bulletPoints || [])
      ].filter(Boolean).join(" "));

      return {
        title: cleanText(job.title || ""),
        company: cleanText(job.companyName || job.advertiser?.description || ""),
        locationText,
        posted,
        workType,
        salary,
        classification,
        description,
        jobId: String(job.id || jobId || ""),
        extractionMode: "search_result_cache"
      };
    }

    function getEffectiveSeekJobId() {
      const profile = DEFAULT_PROFILE;
      return getSeekJobIdFromUrlOrLinks(profile);
    }

    function getSeekRecordUrl(jobId) {
      try {
        const currentUrl = new URL(location.href);

        if (currentUrl.searchParams.get("jobId")) {
          return currentUrl.href;
        }

        if (jobId) {
          return `${currentUrl.origin}/job/${encodeURIComponent(jobId)}`;
        }

        return currentUrl.href;
      } catch (_error) {
        return jobId ? `https://au.seek.com/job/${encodeURIComponent(jobId)}` : location.href;
      }
    }

    function getSeekText(profile, fieldName, minimumLength = 1) {
      return firstScopedText(selectorsFromProfile(profile, fieldName), minimumLength, profile);
    }

    function getSeekPlatformState(profile) {
      const roots = getScopedRoots(profile);
      const applyButtonSelectors = selectorsFromProfile(profile, "apply_button", [
        "a[href*=\"apply\"]",
        "button"
      ]);
      const applyButton = roots
        .flatMap((root) =>
          applyButtonSelectors.flatMap((selector) => safeQuerySelectorAll(root, selector))
        )
        .find((el) => {
          const text = cleanText(el.textContent);
          const aria = cleanText(el.getAttribute("aria-label"));
          const href = cleanText(el.getAttribute("href"));
          const values = [text, aria, href].map(normalize);

          return values.some((value) =>
            value === "apply" ||
            value.includes("apply now") ||
            value.includes("apply for") ||
            value.includes("apply")
          );
        });

      return {
        applied: false,
        applied_text: "",
        can_apply: Boolean(applyButton),
        apply_text: applyButton
          ? cleanText(applyButton.getAttribute("aria-label") || applyButton.textContent || "Apply")
          : ""
      };
    }

    async function extractCurrentSeekJob({ profile } = {}) {
      if (!isSeekJobsPage()) {
        console.log("[ARK Lens] not a SEEK Jobs page");
        return null;
      }

      console.log("[ARK Lens] attempted seek_job_detail extraction");

      const adapterProfile = getSeekProfile(profile);
      const jobId = getSeekJobIdFromUrlOrLinks(adapterProfile);
      const apolloFields = getSeekApolloJobFields(jobId);
      const title = apolloFields?.title || getSeekText(adapterProfile, "title");
      const company = apolloFields?.company || getSeekText(adapterProfile, "company");
      const locationText = apolloFields?.locationText || getSeekText(adapterProfile, "location");
      const posted = apolloFields?.posted || getSeekText(adapterProfile, "posted");
      const workType = apolloFields?.workType || getSeekText(adapterProfile, "work_type");
      const salary = apolloFields?.salary || getSeekText(adapterProfile, "salary");
      const classification = apolloFields?.classification || getSeekText(adapterProfile, "classification");
      const domDescription = getSeekText(adapterProfile, "description", 30);
      const apolloDescription = apolloFields?.description || "";
      const description = [domDescription, apolloDescription]
        .sort((a, b) => b.length - a.length)[0] || "";
      const extractionMode = domDescription && domDescription.length >= apolloDescription.length
        ? "job_detail"
        : apolloFields?.extractionMode || "job_detail";
      const platformState = getSeekPlatformState(adapterProfile);
      const minDescriptionLength =
        adapterProfile.readiness?.min_description_length ?? 50;
      const metadataParts = [
        locationText,
        posted,
        workType,
        salary
      ].filter(Boolean);
      const tertiaryText = metadataParts.join(" · ");
      const ready =
        title &&
        company &&
        description.length >= minDescriptionLength;

      if (!ready) {
        const missingFields = [
          !title ? "title" : "",
          !company ? "company" : "",
          description.length < minDescriptionLength ? "description" : ""
        ].filter(Boolean);

        console.log("[ARK Lens] seek_job_detail extraction not ready", {
          title,
          company,
          descriptionLength: description.length,
          minDescriptionLength,
          missingFields
        });

        return null;
      }

      return buildExtractedJob({
        title,
        company,
        locationText: tertiaryText || locationText,
        description,
        platformState,
        jobId,
        url: getSeekRecordUrl(jobId),
        selectorProfileId: "seek_jobs_v1",
        adapterWarning: !description || description.length < minDescriptionLength,
        extractionMode,
        adapterProfile,
        sourceId: "seek_jobs",
        metadata: {
          raw_location_text: locationText,
          posted,
          work_type: workType,
          salary,
          classification
        }
      });
    }


    async function extractItem(_candidate,options={}){
      const extracted=await extractCurrentSeekJob(options);
      return jobAdapterResult.create("seek_jobs",extracted,{extractionResults,jobCompatibility,sourceAdaptersRuntime});
    }
    function discoverItems(){if(!isSeekJobsPage())return[];return[{item_id:getEffectiveSeekJobId()||null,item_type:"job",source_adapter_id:"seek_jobs"}];}
    function deriveItemId(candidate,result){return result?.item?.item_id||candidate?.item_id||getEffectiveSeekJobId();}
    function selectorObservation(profile,selectorKey,required){
      const selectors=selectorsFromProfile(profile,selectorKey),roots=getScopedRoots(profile);
      const count=roots.reduce((total,root)=>total+selectors.reduce((sum,selector)=>sum+safeQuerySelectorAll(root,selector).length,0),0);
      return adapterDiagnostics.createSelectorObservation({selector_key:selectorKey,matched:count>0,match_count:count,required,
        observation:count>0?"Selector structure matched.":"Selector structure was not observed."});
    }
    async function diagnose(options={}){
      const profile=getSeekProfile(options.profile),candidates=discoverItems(),definition=sourceAdaptersRuntime.getAdapterDefinition("seek_jobs");
      const extractionResult=await extractionResults.guardExtraction(()=>extractItem(candidates[0]||null,{...options,profile}),
        {required_capabilities:definition.capabilities.required,optional_capabilities:definition.capabilities.optional});
      const selector_observations=[selectorObservation(profile,"detail_root",false),selectorObservation(profile,"title",true),
        selectorObservation(profile,"company",true),selectorObservation(profile,"description",true),selectorObservation(profile,"location",false)];
      return adapterDiagnostics.fromExtractionResult({adapter_id:"seek_jobs",item_type:"job",location_supported:isSeekJobsPage(),
        structure_detected:selector_observations.some(x=>x.matched),discovered_item_count:candidates.length,
        extraction_result:extractionResult,selector_observations});
    }
    return Object.freeze({defaultProfile:DEFAULT_PROFILE,diagnose,discoverItems,deriveItemId,extractItem,
      extractRaw:extractCurrentSeekJob,getApolloJobFields:getSeekApolloJobFields,getDefaultProfile:getSeekProfile,
      getEffectiveItemId:getEffectiveSeekJobId,getFallbackRoot,getPlatformState:getSeekPlatformState,
      getJobIdFromUrlOrLinks:getSeekJobIdFromUrlOrLinks,getScopedRoots,
      getSelectors:selectorsFromProfile,getText:getSeekText,resetTransientState(){}});
  }
  return {DEFAULT_PROFILE,create};
});

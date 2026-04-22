(function registerReleaseUpdateTestExtension(factory) {
  const token = document.currentScript?.dataset?.extensionToken || "";

  if (!token) {
    throw new Error("Missing extension activation token");
  }

  window.registerExtension(factory, token);
})(function (api) {
  const React = api.React;
  const {
    Badge,
    Box,
    Button,
    Divider,
    HStack,
    Spinner,
    Text,
    VStack,
  } = api.ChakraUI;

  const DEFAULT_MANIFEST_ASSET = "sjmcl.ext.json";

  function parseSemver(version) {
    const value = String(version || "").trim();
    const match = value.match(
      /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
    );

    if (!match) {
      throw new Error(`Invalid semver version: ${value || "(empty)"}`);
    }

    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      prerelease: match[4] ? match[4].split(".") : [],
    };
  }

  function compareIdentifiers(left, right) {
    const leftIsNumeric = /^(0|[1-9]\d*)$/.test(left);
    const rightIsNumeric = /^(0|[1-9]\d*)$/.test(right);

    if (leftIsNumeric && rightIsNumeric) {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      if (leftNumber === rightNumber) return 0;
      return leftNumber < rightNumber ? -1 : 1;
    }

    if (leftIsNumeric) return -1;
    if (rightIsNumeric) return 1;
    if (left === right) return 0;
    return left < right ? -1 : 1;
  }

  function comparePrerelease(left, right) {
    if (left.length === 0 && right.length === 0) return 0;
    if (left.length === 0) return 1;
    if (right.length === 0) return -1;

    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const leftPart = left[index];
      const rightPart = right[index];

      if (leftPart === undefined) return -1;
      if (rightPart === undefined) return 1;

      const comparison = compareIdentifiers(leftPart, rightPart);
      if (comparison !== 0) {
        return comparison;
      }
    }

    return 0;
  }

  function compareSemver(leftVersion, rightVersion) {
    const left = parseSemver(leftVersion);
    const right = parseSemver(rightVersion);

    if (left.major !== right.major) {
      return left.major < right.major ? -1 : 1;
    }
    if (left.minor !== right.minor) {
      return left.minor < right.minor ? -1 : 1;
    }
    if (left.patch !== right.patch) {
      return left.patch < right.patch ? -1 : 1;
    }

    return comparePrerelease(left.prerelease, right.prerelease);
  }

  function readManifestVersion(manifest, label) {
    const version = manifest && typeof manifest.version === "string" ? manifest.version.trim() : "";
    if (!version) {
      throw new Error(`${label} is missing a valid version`);
    }
    parseSemver(version);
    return version;
  }

  function normalizeReleaseSource(manifest) {
    const source = manifest && manifest.releaseSource ? manifest.releaseSource : {};
    const provider = String(source.provider || "github").trim().toLowerCase();
    const owner = String(source.owner || "").trim();
    const repo = String(source.repo || "").trim();
    const assetName = String(source.assetName || DEFAULT_MANIFEST_ASSET).trim();

    if (provider !== "github") {
      throw new Error(`Unsupported release provider: ${provider || "(empty)"}`);
    }
    if (!owner || !repo) {
      throw new Error("releaseSource.owner and releaseSource.repo are required");
    }

    return {
      provider,
      owner,
      repo,
      assetName: assetName || DEFAULT_MANIFEST_ASSET,
    };
  }

  async function readLocalManifest() {
    const response = await fetch(api.resolveAssetUrl("sjmcl.ext.json"), {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to read local manifest: HTTP ${response.status}`);
    }

    return await response.json();
  }

  async function requestJson(request, url, init) {
    const response = await request(url, init);
    if (!response.ok) {
      const body = await response.text().catch(function () {
        return "";
      });
      throw new Error(
        `Request failed (${response.status} ${response.statusText || ""}): ${body}`.trim()
      );
    }
    return await response.json();
  }

  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString("zh-CN", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getStatusMeta(status) {
    if (status === "update-available") {
      return {
        badgeText: "有更新",
        colorScheme: "green",
        summary: "发现比当前已安装版本更新的 release manifest。",
      };
    }

    if (status === "ahead-of-release") {
      return {
        badgeText: "本地更高",
        colorScheme: "orange",
        summary: "当前扩展版本高于 GitHub latest release。",
      };
    }

    return {
      badgeText: "已最新",
      colorScheme: "blue",
      summary: "当前扩展版本与 latest release manifest 一致。",
    };
  }

  async function buildReleaseReport(host) {
    const localManifest = await readLocalManifest();
    const currentVersion = readManifestVersion(localManifest, "Local manifest version");
    const releaseSource = normalizeReleaseSource(localManifest);
    const releaseApiUrl =
      `https://api.github.com/repos/${encodeURIComponent(releaseSource.owner)}/` +
      `${encodeURIComponent(releaseSource.repo)}/releases/latest`;

    const release = await requestJson(host.actions.request, releaseApiUrl, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Cache-Control": "no-cache",
      },
    });

    const assets = Array.isArray(release.assets) ? release.assets : [];
    const manifestAsset = assets.find(function (asset) {
      return asset && asset.name === releaseSource.assetName;
    });

    if (!manifestAsset || !manifestAsset.browser_download_url) {
      throw new Error(
        `Latest release does not include asset ${releaseSource.assetName}`
      );
    }

    const remoteManifestText = await host.actions.requestText(
      manifestAsset.browser_download_url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      }
    );
    const remoteManifest = JSON.parse(remoteManifestText);
    const latestVersion = readManifestVersion(remoteManifest, "Release manifest version");

    if (remoteManifest.identifier !== localManifest.identifier) {
      throw new Error(
        `Manifest identifier mismatch: expected ${localManifest.identifier}, got ${remoteManifest.identifier}`
      );
    }

    const comparison = compareSemver(currentVersion, latestVersion);
    const status = comparison < 0 ? "update-available" : comparison > 0 ? "ahead-of-release" : "up-to-date";

    return {
      status,
      currentVersion,
      latestVersion,
      releaseName: release.name || release.tag_name || "Untitled release",
      releaseUrl: release.html_url || "",
      publishedAt: release.published_at || release.created_at || "",
      assetName: manifestAsset.name,
      assetUrl: manifestAsset.browser_download_url,
      checkedAt: new Date().toISOString(),
    };
  }

  const PanelComponent = function ReleaseUpdatePanel() {
    const host = api.getHostContext();
    const useExtensionState = host.state.useExtensionState;
    const [report, setReport] = useExtensionState("release-report", null);
    const [error, setError] = useExtensionState("release-error", "");
    const [isLoading, setIsLoading] = useExtensionState("release-loading", false);
    const [hasInitialized, setHasInitialized] = useExtensionState("release-initialized", false);

    const checkForUpdates = React.useCallback(
      async function checkForUpdates() {
        setIsLoading(true);
        setError("");

        try {
          const nextReport = await buildReleaseReport(host);
          setReport(nextReport);
        } catch (reason) {
          const message = reason && reason.message ? reason.message : String(reason);
          setError(message);
          host.actions.logger.error("[release_update_test] Failed to check release update", reason);
        } finally {
          setIsLoading(false);
        }
      },
      [host, setError, setIsLoading, setReport]
    );

    React.useEffect(
      function ensureFirstCheck() {
        if (hasInitialized) return;
        setHasInitialized(true);
        checkForUpdates();
      },
      [checkForUpdates, hasInitialized, setHasInitialized]
    );

    const statusMeta = getStatusMeta(report ? report.status : "up-to-date");

    return React.createElement(
      VStack,
      { align: "stretch", spacing: 3 },
      React.createElement(
        HStack,
        { justify: "space-between", align: "center" },
        React.createElement(Text, { fontSize: "sm", fontWeight: "bold" }, "Release Update Test"),
        React.createElement(
          Badge,
          {
            colorScheme: report ? statusMeta.colorScheme : isLoading ? "purple" : "gray",
            variant: "subtle",
          },
          report ? statusMeta.badgeText : isLoading ? "检查中" : "未检查"
        )
      ),
      React.createElement(
        Text,
        { fontSize: "xs", className: "secondary-text" },
        "通过 GitHub latest release 里的 sjmcl.ext.json 获取版本，并按 semver 比较是否有更新。"
      ),
      React.createElement(
        Box,
        {
          borderWidth: "1px",
          borderColor: "whiteAlpha.200",
          borderRadius: "md",
          px: 3,
          py: 3,
        },
        isLoading && !report
          ? React.createElement(
              HStack,
              { spacing: 3, justify: "center" },
              React.createElement(Spinner, { size: "sm" }),
              React.createElement(Text, { fontSize: "sm" }, "正在请求 GitHub release...")
            )
          : React.createElement(
              VStack,
              { align: "stretch", spacing: 2 },
              React.createElement(
                HStack,
                { justify: "space-between" },
                React.createElement(Text, { fontSize: "sm" }, "当前版本"),
                React.createElement(
                  Text,
                  { fontSize: "sm", fontWeight: "semibold" },
                  report ? report.currentVersion : "-"
                )
              ),
              React.createElement(
                HStack,
                { justify: "space-between" },
                React.createElement(Text, { fontSize: "sm" }, "latest 版本"),
                React.createElement(
                  Text,
                  { fontSize: "sm", fontWeight: "semibold" },
                  report ? report.latestVersion : "-"
                )
              ),
              React.createElement(
                HStack,
                { justify: "space-between", align: "flex-start" },
                React.createElement(Text, { fontSize: "sm" }, "release"),
                React.createElement(
                  Text,
                  {
                    fontSize: "sm",
                    fontWeight: "medium",
                    textAlign: "right",
                    maxW: "220px",
                  },
                  report ? report.releaseName : "-"
                )
              ),
              React.createElement(
                HStack,
                { justify: "space-between" },
                React.createElement(Text, { fontSize: "sm" }, "发布时间"),
                React.createElement(
                  Text,
                  { fontSize: "sm", textAlign: "right" },
                  report ? formatDateTime(report.publishedAt) : "-"
                )
              ),
              React.createElement(
                HStack,
                { justify: "space-between", align: "flex-start" },
                React.createElement(Text, { fontSize: "sm" }, "manifest 资源"),
                React.createElement(
                  Text,
                  {
                    fontSize: "sm",
                    textAlign: "right",
                    maxW: "220px",
                    className: "secondary-text",
                  },
                  report ? report.assetName : DEFAULT_MANIFEST_ASSET
                )
              )
            )
      ),
      report
        ? React.createElement(
            Text,
            {
              fontSize: "xs",
              color:
                report.status === "update-available"
                  ? "green.200"
                  : report.status === "ahead-of-release"
                    ? "orange.200"
                    : "blue.200",
            },
            statusMeta.summary
          )
        : null,
      error
        ? React.createElement(Text, { fontSize: "xs", color: "orange.200" }, error)
        : null,
      React.createElement(Divider, null),
      React.createElement(
        HStack,
        { justify: "space-between", align: "center" },
        React.createElement(
          Text,
          { fontSize: "xs", className: "secondary-text" },
          report ? `上次检查: ${formatDateTime(report.checkedAt)}` : "尚未完成检查"
        ),
        React.createElement(
          HStack,
          { spacing: 2 },
          React.createElement(
            Button,
            { size: "xs", onClick: checkForUpdates, isLoading: isLoading },
            "刷新"
          ),
          React.createElement(
            Button,
            {
              size: "xs",
              variant: "ghost",
              isDisabled: !report || !report.assetUrl,
              onClick: function () {
                if (!report || !report.assetUrl) return;
                host.actions.openExternalLink(report.assetUrl);
              },
            },
            "打开 Manifest"
          ),
          React.createElement(
            Button,
            {
              size: "xs",
              variant: "ghost",
              isDisabled: !report || !report.releaseUrl,
              onClick: function () {
                if (!report || !report.releaseUrl) return;
                host.actions.openExternalLink(report.releaseUrl);
              },
            },
            "打开 Release"
          )
        )
      )
    );
  };

  return {
    homeWidget: {
      title: "Release Update Test",
      defaultWidth: 360,
      minWidth: 320,
      Component: PanelComponent,
    },
  };
});

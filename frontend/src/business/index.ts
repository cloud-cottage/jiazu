export { buildTreeUrl, treePathAlias, openTreeHome, buildCrossTreePersonUrl, validateExternalRefs, resolveTreeIdByHost, mirrorTargetOf, mirrorLabelOf, mirrorNoteText, treeDisplayTitleOf, MIRROR_UNAVAILABLE_NOTE, treeKindOf, treeLayerOf, isReadonlyMirror, isOrphanMirror, hasFounderRegistrationPointer, mirrorReadonlyViewOf } from './cross-tree';
export type { MirrorFields, MirrorTarget, MirrorReadonlyView } from './cross-tree';
export { fetchPerson, fetchPersonForEdit, savePerson, savePersonPlaces, API_BASE, fetchPersonList, fetchFamilyList, searchPeople, searchPeopleGlobal, searchMarriageCandidates, fetchTreeMeta, fetchTreeMetaRemote, updateTreeMeta, fetchOriginCandidates, setTreeOrigin, splitTree, createTree, fetchWallet, rechargeWallet, setTreeCreateFee, fetchMasterTree, fetchTreeStats, fetchTreeRank, clearMetaCache, sendSmsCode, registerByPhone, loginByPhone, fetchMe, submitJoinRequest, fetchJoinRequests, approveJoinRequest, rejectJoinRequest, fetchMyAnchor, requestLeave, fetchLeaveRequests, approveLeave, removeBranchLink, addParentNode, addChildNode, appendChainNode, addSpouseNode, reparentNode, siblingReorder, deleteNode, marriageRequest, fetchMarriageRequests, decideMarriageRequest, marryEnd, founderRequest, fetchFounderRequests, decideFounderRequest, attachFounder, detachFounder, resetFounder, FOUNDER_LOCK_MESSAGE, CLAN_FOUNDER_LOCK_MESSAGE, CHAIN_MIRROR_LOCK_MESSAGE, ORPHAN_MIRROR_LOCK_MESSAGE, familyMirrorLockMessage, treeKindLabel, fetchClans, fetchClanInfo, submitClanRequest, fetchClanRequests, decideClanRequest } from './api';
export type { TreeKind, ClanSummary, ClanInfo, ClanMirrorNode, ClanOwnNode, ClanBranch, ClanRequestItem, FounderAttachment, FounderRequestItem, NodeDeleteMode, NodeDeleteResult, FeeInfo, GlobalPersonHit, MarriageCandidate, PersonPlaceSavePayload } from './api';
export type { TreeOriginCandidate, TreeOriginCandidates, SetTreeOriginResult, SiblingReorderPayload, SiblingReorderResult, SiblingReorderFee, SiblingReorderSegment } from './types';
export { ApiStatusError } from './api';
export { HOW_TO_GET, feeText, isAssetInsufficientError, goMyAssets, showAssetInsufficientGuide } from './asset-guide';
export { fetchSpirit, postSpiritCharge, postMountJade, postSynthesizeJade, postDecomposeJade } from './api';
export type { SpiritInfo, SpiritStatus, SpiritPlan, SpiritPlanItem, SpiritLogItem, SpiritJade, SpiritChargeResult, MountJadeResult, JadeSynthesizeResult, JadeDecomposeResult } from './api';
export { postEstablishBranch, postConvergeClan } from './api';
export type { EstablishBranchResult, ConvergeSpiritTransfer, ConvergeClanResult } from './types';
export { fetchMarketListings, fetchMyListings, postMarketList, postMarketCancel, postMarketBuy, postOfficialBuy } from './api';
export type { MarketListing, MarketListingStatus, MarketOfficial, MarketListingsResult, MarketMyResult, MarketMyAssets, MarketListResult, MarketBuyResult, OfficialBuyResult } from './api';
export { fetchMessages, postMessagesRead, postAdminAssetsGrant, fetchAdminAssetsLogs, fetchAdminAssetsUser, deleteAccount, jadeListOf, jadeCountOf } from './api';
// 兰帖残页【手动合成】（2026-09-26 裁定：手动合成为唯一合成入口；与 `postDecomposeScroll` 对偶）
export { synthesizeScrollRemote } from './friends';
export type { ScrollSynthesizeResult } from './friends';
export type { MessageItem, MessageType, MessagesResult, MessagesReadResult, OpsLog, OpsLogFilters, GrantPayload, GrantSummary, GrantResult, AdminAssetSnapshot, DeleteAccountResult } from './api';
export { isLiving, sanitizePerson } from './privacy';
export {
  JADE_SYNTH_SEEDS,
  JADE_PERMANENT_THRESHOLD_DAYS,
  SEED_VALID_DAYS,
  SYNTH_CONFIRM_TITLE,
  SYNTH_CONFIRM_BODY,
  MOUNT_CONFIRM_TITLE,
  MOUNT_CONFIRM_BODY,
  DECOMPOSE_CONFIRM_TITLE,
  DECOMPOSE_CONFIRM_BODY,
} from './jade-ops';
export { buildPedigreeForest, flattenForest } from './pedigree';
export { personIdDisplay, dateDisplay, titleLabel, nameWithTitles, attrMapOf, TITLE_ATTR_KEYS, TITLE_DISPLAY_ORDER } from './format';
export { provincesOf, citiesOf, countiesOf, resolveNames, pathOfCode, isKnownCode, SHOW_FILTER_NAMES, OVERSEAS_CODE } from './geo';
export type { GeoProvince, GeoCity, GeoCounty, ResolvedOriginNames, OriginPath } from './geo';
export { MAX_RESIDENCE_PLACES, emptyPlaceInput, normalizePlace, prunePlaces, placesDirty, placeDisplayOf, placeViewOf, placeViewsOf } from './place';
export type { PersonPlaceInput, PersonPlaceView, ProfileLifespanView } from './types';
export { ICON, genderIconSrc } from './icons';
export type { TreePersonNode } from './pedigree';
export type { TreeMeta, TreeEntry, PersonSummary, PersonDetail, PersonProfile, FamilyRef, EventRef, MediaRef, CitationRef, NoteRef, CustomAttribute, SearchParams, SearchResult, DigitalHallCard } from './types';

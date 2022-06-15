
mytokens = [];
mytokensfolders = [];
tokens_rootfolders = [];
monster_search_filters = {};
encounter_monster_items = {}; // encounterId: SidebarTokenItem[]
cached_monster_items = {}; // monsterId: SidebarTokenItem

/** Reads in tokendata, and writes to mytokens and mytokensfolders; marks tokendata objects with didMigrateToMyToken = false; */
function migrate_to_my_tokens() {
    if (tokendata.didMigrateToMyToken === true) {
        console.log("migrate_to_my_tokens has already been run. returning early");
        return;
    }

    console.groupCollapsed("migrate_to_my_tokens");

    const migrateFolderAtPath = function(oldFolderPath) {
        let currentFolderPath = sanitize_folder_path(oldFolderPath);
        let folder = convert_path(currentFolderPath);
        if (folder.tokens) {
            for(let tokenKey in folder.tokens) {
                let oldToken = folder.tokens[tokenKey];
                if (oldToken.didMigrateToMyToken === true) {
                    // this token has already been migrated no need to migrate it again
                    continue;
                }
                let newToken = {};
                for (let k in oldToken) {
                    let v = oldToken[k];
                    if (k === "data-token-size") {
                        newToken.tokenSize = v;
                    } else if (k === "data-alternative-images") {
                        newToken.alternativeImages = v;
                    } else if (k.startsWith("data-")) {
                        newToken[k.replace("data-", "")] = v;
                    } else {
                        newToken[k] = v;
                    }
                }
                if (newToken.name === undefined) {
                    newToken.name = tokenKey;
                }
                newToken.folderPath = currentFolderPath;
                newToken.image = parse_img(newToken.img);
                delete newToken.img;
                let existing = mytokens.find(t => t.name === newToken.name && t.folderPath === newToken.folderPath)
                if (existing !== undefined) {
                    console.log("not adding duplicate token", newToken);
                } else {
                    console.log("successfully migrated token", newToken, "from", oldToken);
                    mytokens.push(newToken);
                }
                oldToken.didMigrateToMyToken = true;
            }
        }
        if (folder.folders) {
            for (let folderKey in folder.folders) {
                mytokensfolders.push({ name: folderKey, folderPath: currentFolderPath, collapsed: true });
                migrateFolderAtPath(`${currentFolderPath}/${folderKey}`);
            }
        }
    }

    migrateFolderAtPath(RootFolder.Root.path);
    tokendata.didMigrateToMyToken = true;
    persist_my_tokens();
    persist_customtokens();
    console.groupEnd();
}

/** erases mytokens and mytokensfolders; marks tokendata objects with didMigrateToMyToken = false; */
function rollback_from_my_tokens() {
    console.groupCollapsed("rollback_from_my_tokens");
    tokendata.didMigrateToMyToken = false;
    mytokens = [];
    mytokensfolders = [];
    persist_my_tokens();
    const rollbackFolderAtPath = function(oldFolderPath) {
        let currentFolderPath = sanitize_folder_path(oldFolderPath);
        let folder = convert_path(currentFolderPath);
        console.log("attempting to roll back all tokens in folder", currentFolderPath, folder);
        if (folder.tokens) {
            for (let tokenKey in folder.tokens) {
                let oldToken = folder.tokens[tokenKey];
                oldToken.didMigrateToMyToken = false;
                console.log("rolling back oldToken", oldToken);
            }
        }
        for (let folderName in folder.folders) {
            let nextFolderPath = `${currentFolderPath}/${folderName}`;
            rollbackFolderAtPath(nextFolderPath);
        }
    };
    rollbackFolderAtPath(RootFolder.Root.path);
    persist_customtokens();
    console.groupEnd();
}

function list_item_from_monster_id(monsterId) {
    let found = cached_monster_items[monsterId];
    if (found === undefined) {
        found = window.monsterListItems.find(i => i.monsterData.id === monsterId);
    }
    if (found === undefined) {
        for (let encounterId in encounter_monster_items) {
            if (found === undefined) {
                let encounterMonsters = encounter_monster_items[encounterId];
                found = encounterMonsters.find(i => i.monsterData.id === monsterId);
            }
        }
    }
    return found;
}

function list_item_from_player_id(playerId) {
    let pc = window.pcs.find(p => p.sheet = playerId);
    if (pc === undefined) return undefined;
    let fullPath = sanitize_folder_path(`${RootFolder.Players.path}/${pc.name}`);
    return find_sidebar_list_item_from_path(fullPath);
}

function list_item_from_token(placedToken) {
    let listItemPath = placedToken.options.listItemPath;
    if (listItemPath !== undefined && listItemPath.length > 0) {
        // this token was placed after we unified tokens
        return find_sidebar_list_item_from_path(listItemPath);
    }

    if (placedToken.isMonster()) {
        // we can't figure this one out synchronously
        return list_item_from_monster_id(placedToken.options.monster);
    } else if (placedToken.isPlayer()) {
        return list_item_from_player_id(placedToken.options.id);
    } else {
        // need to migrate from the old custom_tokens
        let tokenDataPath = placedToken.options.tokendatapath !== undefined ? placedToken.options.tokendatapath : "";
        let tokenDataName = placedToken.options.tokendataname !== undefined ? placedToken.options.tokendataname : placedToken.options.name;
        if (tokenDataPath.startsWith("/AboveVTT BUILTIN")) {
            let convertedPath = tokenDataPath.replace("/AboveVTT BUILTIN", RootFolder.AboveVTT.path);
            let fullPath = sanitize_folder_path(`${convertedPath}/${tokenDataName}`);
            return find_sidebar_list_item_from_path(fullPath);
        } else {
            let fullPath = sanitize_folder_path(`${RootFolder.MyTokens.path}/${tokenDataPath}/${tokenDataName}`);
            return find_sidebar_list_item_from_path(fullPath);
        }
    }
}

/**
 * Finds a "Builtin Token" that matches the given path
 * @param fullPath {string} the path of the "Builtin Token" you're looking for
 * @returns {undefined|*} the "Builtin Token" object if found; else undefined
 */
function find_builtin_token(fullPath) {
    if (!fullPath.startsWith(RootFolder.AboveVTT.path)) {
        console.warn("find_builtin_token was called with the wrong token type.", fullPath, "should start with", RootFolder.AboveVTT.path);
        return undefined;
    }
    console.groupCollapsed("find_builtin_token");
    let found = builtInTokens.find(t => {
        let dirtyPath = `${RootFolder.AboveVTT.path}${t.folderPath}/${t.name}`;
        let fullTokenPath = sanitize_folder_path(dirtyPath);
        console.debug("looking for: ", fullPath, dirtyPath, fullTokenPath, fullTokenPath === fullPath, t);
        return fullTokenPath === fullPath;
    });
    console.debug("found: ", found);
    console.groupEnd();
    return found;
}

function backfill_mytoken_folders() {
    mytokens.forEach(myToken => {
        if (myToken.folderPath !== RootFolder.Root.path) {
            // we split the path and backfill empty every folder along the way if needed. This is really important for folders that hold subfolders, but not items
            let parts = myToken.folderPath.split("/");
            let backfillPath = "";
            parts.forEach(part => {
                let fullBackfillPath = sanitize_folder_path(`${backfillPath}/${part}`);
                if (fullBackfillPath !== RootFolder.Root.path && !mytokensfolders.find(fi => sanitize_folder_path(`${fi.folderPath}/${fi.name}`) === fullBackfillPath)) {
                    // we don't have this folder yet so add it
                    let newFolder = { folderPath: sanitize_folder_path(backfillPath), name: part, collapsed: true };
                    console.log("adding folder", newFolder);
                    mytokensfolders.push(newFolder);
                } else {
                    console.log("not adding folder", fullBackfillPath);
                }
                backfillPath = fullBackfillPath;
            });
        }
    });
}

/**
 * iterates over all the token sources and replaces window.tokenListItems with new objects.
 * token sources are window.pcs, mytokens, mytokensfolders, and builtInTokens
 */
function rebuild_token_items_list() {
    console.groupCollapsed("rebuild_token_items_list");

    backfill_mytoken_folders(); // just in case we're missing any folders

    // Players
    let tokenItems = window.pcs
        .filter(pc => pc.sheet !== undefined && pc.sheet !== "")
        .map(pc => SidebarListItem.PC(pc.sheet, pc.name, pc.image));

    // My Tokens Folders
    window.TOKEN_CUSTOMIZATIONS
        .filter(tc => tc.tokenType === ItemType.Folder && tc.fullPath().startsWith(RootFolder.MyTokens.path))
        .forEach(tc => {
            tokenItems.push(SidebarListItem.Folder(tc.id, tc.folderPath(), tc.name(), tc.tokenOptions.collapsed, tc.parentId))
        })

    // My Tokens
    window.TOKEN_CUSTOMIZATIONS
        .filter(tc => tc.tokenType === ItemType.MyToken)
        .forEach(tc => tokenItems.push(SidebarListItem.MyToken(tc)))

    // AboveVTT Tokens
    let allBuiltinPaths = builtInTokens
        .filter(item => item.folderPath !== RootFolder.Root.path && item.folderPath !== "" && item.folderPath !== undefined)
        .map(item => item.folderPath);
    let builtinPaths = [...new Set(allBuiltinPaths)];
    for (let i = 0; i < builtinPaths.length; i++) {
        let path = builtinPaths[i];
        let pathComponents = path.split("/");
        let folderName = pathComponents.pop();
        let folderPath = pathComponents.join("/");
        let builtinFolderPath = sanitize_folder_path(`${RootFolder.AboveVTT.path}/${folderPath}`);
        tokenItems.push(
            SidebarListItem.Folder(path_to_html_id(builtinFolderPath, folderName),
                builtinFolderPath,
                folderName,
                true,
            builtinFolderPath === RootFolder.AboveVTT.path ? RootFolder.AboveVTT.id : path_to_html_id(builtinFolderPath)
            )
        );
    }
    for (let i = 0; i < builtInTokens.length; i++) {
        tokenItems.push(SidebarListItem.BuiltinToken(builtInTokens[i]));
    }

    // Encounters and Encounter Monsters
    for (const encounterId in window.EncounterHandler.encounters) {
        let encounter = window.EncounterHandler.encounters[encounterId];
        if (encounter.name === "AboveVTT") continue; // don't display our backing encounter
        tokenItems.push(SidebarListItem.Encounter(encounter));
        // encounter_monster_items[encounterId]?.forEach(monsterItem => tokenItems.push(monsterItem));
    }

    window.tokenListItems = tokenItems;
    console.groupEnd();
}

/**
 * replaces window.monsterListItems with a list of items where the item.name matches the searchTerm (case-insensitive)
 * @param searchTerm {string} the search term that the user typed into the search input
 */
function filter_token_list(searchTerm) {

    if (typeof searchTerm !== "string") {
        searchTerm = "";
    }

    console.log("filter_token_list searchTerm", searchTerm)

    redraw_token_list(searchTerm);

    if (searchTerm.length > 0) {
        let allFolders = tokensPanel.body.find(".folder");
        allFolders.removeClass("collapsed"); // auto expand all folders
        for (let i = 0; i < allFolders.length; i++) {
            let currentFolder = $(allFolders[i]);
            if (matches_full_path(currentFolder, RootFolder.Monsters.path)) {
                // we always want the monsters folder to be open when searching
                continue;
            }
            let nonFolderDescendents = currentFolder.find(".sidebar-list-item-row:not(.folder)");
            if (nonFolderDescendents.length === 0) {
                // hide folders without results in them
                currentFolder.hide();
            }
        }
    }

    console.log("filter_token_list about to call inject_monster_tokens");

    window.monsterListItems = []; // don't let this grow unbounded
    inject_monster_tokens(searchTerm, 0);
}

/**
 * Calls the DDB API to search for monsters matching the given searchTerm and injects the results into the sidebar panel
 * @param searchTerm {string} the search term that the user typed into the search input
 * @param skip {number} the pagination offset. This function will inject a "Load More" button with the skip details embedded. You don't need to pass anything for this.
 */
function inject_monster_tokens(searchTerm, skip) {
    console.log("inject_monster_tokens about to call search_monsters");
    search_monsters(searchTerm, skip, function (monsterSearchResponse) {
        let listItems = [];

        for (let i = 0; i < monsterSearchResponse.data.length; i++) {
            let m = monsterSearchResponse.data[i];
            let item = SidebarListItem.Monster(m)
            window.monsterListItems.push(item);
            listItems.push(item);
        }
        console.log("search_monsters converted", listItems);
        let monsterFolder = find_html_row_from_path(RootFolder.Monsters.path, tokensPanel.body);
        inject_monster_list_items(listItems);
        if (searchTerm.length > 0) {
            monsterFolder.removeClass("collapsed");
        }
        console.log("search_monster pagination ", monsterSearchResponse.pagination.total, monsterSearchResponse.pagination.skip, monsterSearchResponse.pagination.total > monsterSearchResponse.pagination.skip);
        monsterFolder.find(".load-more-button").remove();
        if (monsterSearchResponse.pagination.total > (monsterSearchResponse.pagination.skip + 10)) {
            // add load more button
            let loadMoreButton = $(`<button class="ddbeb-button load-more-button" data-skip="${monsterSearchResponse.pagination.skip}">Load More</button>`);
            loadMoreButton.click(function(loadMoreClickEvent) {
                console.log("load more!", loadMoreClickEvent);
                let previousSkip = parseInt($(loadMoreClickEvent.currentTarget).attr("data-skip"));
                inject_monster_tokens(searchTerm, previousSkip + 10);
            });
            monsterFolder.find(`> .folder-item-list`).append(loadMoreButton);
        }
    });
}

function inject_monster_list_items(listItems) {
    let monsterFolder = find_html_row_from_path(RootFolder.Monsters.path, tokensPanel.body);
    if (monsterFolder === undefined || monsterFolder.length === 0) {
        console.warn("inject_monster_list_items failed to find the monsters folder");
        return;
    }
    let list = monsterFolder.find(`> .folder-item-list`);
    for (let i = 0; i < listItems.length; i++) {
        let item = listItems[i];
        let row = build_sidebar_list_row(item);
        enable_draggable_token_creation(row);
        list.append(row);
    }
}

/** Called on startup. It reads from localStorage, and initializes all the things needed for the TokensPanel to function properly */
function init_tokens_panel() {

    console.log("init_tokens_panel");

    tokens_rootfolders = [
        SidebarListItem.Folder(RootFolder.Players.id, RootFolder.Root.path, RootFolder.Players.name, false, path_to_html_id(RootFolder.Root.path)),
        SidebarListItem.Folder(RootFolder.Monsters.id, RootFolder.Root.path, RootFolder.Monsters.name, false, path_to_html_id(RootFolder.Root.path)),
        SidebarListItem.Folder(RootFolder.MyTokens.id, RootFolder.Root.path, RootFolder.MyTokens.name, false, path_to_html_id(RootFolder.Root.path)),
        SidebarListItem.Folder(RootFolder.AboveVTT.id, RootFolder.Root.path, RootFolder.AboveVTT.name, false, path_to_html_id(RootFolder.Root.path)),
        SidebarListItem.Folder(RootFolder.Encounters.id, RootFolder.Root.path, RootFolder.Encounters.name, false, path_to_html_id(RootFolder.Root.path))
    ];

    if(localStorage.getItem('MyTokens') != null){
        mytokens = $.parseJSON(localStorage.getItem('MyTokens'));
    }
    if(localStorage.getItem('MyTokensFolders') != null){
        mytokensfolders = $.parseJSON(localStorage.getItem('MyTokensFolders'));
    }
    if(localStorage.getItem('CustomTokens') != null){
        tokendata=$.parseJSON(localStorage.getItem('CustomTokens'));
    }

    migrate_to_my_tokens();
    migrate_token_customizations();
    rebuild_token_items_list();
    update_token_folders_remembered_state();

    let header = tokensPanel.header;
    // TODO: remove this warning once tokens are saved in the cloud
    tokensPanel.updateHeader("Tokens");
    add_expand_collapse_buttons_to_header(tokensPanel);
    header.append("<div class='panel-warning'>WARNING/WORKINPROGRESS. THIS TOKEN LIBRARY IS CURRENTLY STORED IN YOUR BROWSER STORAGE. IF YOU DELETE YOUR HISTORY YOU LOOSE YOUR LIBRARY</div>");

    let searchInput = $(`<input name="token-search" type="text" style="width:96%;margin:2%" placeholder="search tokens">`);
    searchInput.off("input").on("input", mydebounce(() => {
        let textValue = tokensPanel.header.find("input[name='token-search']").val();
        filter_token_list(textValue);
    }, 500));
    header.append(searchInput);

    register_token_row_context_menu();          // context menu for each row
    register_custom_token_image_context_menu(); // context menu for images within the customization modal

    read_local_monster_search_filters();

    window.monsterListItems = []; // don't let this grow unbounded
    setTimeout(function () {
        // give it a couple of second to make sure everything is rendered before fetching the base monsters
        // this isn't ideal, but the loading screen is up for much longer anyway...
        filter_token_list("");
    }, 2000);
}

/**
 * clears and redraws the list of tokens in the sidebar
 * @param searchTerm {string} the search term used to filter the list of tokens
 * @param enableDraggable {boolean} whether or not to make items draggable. Defaults to true
 */
function redraw_token_list(searchTerm, enableDraggable = true) {
    if (!window.tokenListItems) {
        // don't do anything on startup
        return;
    }
    console.groupCollapsed("redraw_token_list");
    let list = $(`<div class="custom-token-list"></div>`);
    tokensPanel.body.empty();
    tokensPanel.body.append(list);

    let nameFilter = "";
    if (searchTerm !== undefined && typeof searchTerm === "string") {
        nameFilter = searchTerm.toLowerCase();
    }

    // first let's add our root folders
    for (let i = 0; i < tokens_rootfolders.length; i++) {
        let row = build_sidebar_list_row(tokens_rootfolders[i]);
        list.append(row);
    }

    // now let's add all other folders without filtering by searchTerm because we need the folder to exist in order to add items into it
    window.tokenListItems
        .filter(item => item.isTypeFolder())
        .sort(SidebarListItem.folderDepthComparator)
        .forEach(item => {
            let row = build_sidebar_list_row(item);
            console.debug("appending item", item);
            $(`#${item.parentId} > .folder-item-list`).append(row);
            // find_html_row_from_path(item.folderPath, list).find(` > .folder-item-list`).append(row);
        });

    // now let's add all the other items
    window.tokenListItems
        .filter(item =>
            !item.isTypeFolder() // we already added all folders so don't include them in this loop
            && item.nameOrContainingFolderMatches(nameFilter)
        )
        .sort(SidebarListItem.sortComparator)
        .forEach(item => {
            let row = build_sidebar_list_row(item);
            if (enableDraggable === true && !item.isTypeEncounter()) {
                enable_draggable_token_creation(row);
            }
            console.debug("appending item", item);
            $(`#${item.parentId} > .folder-item-list`).append(row);
            // find_html_row_from_path(item.folderPath, list).find(` > .folder-item-list`).append(row);
        });

    update_pc_token_rows();
    inject_encounter_monsters();
    console.groupEnd()
}

/**
 * Enables dragging the given html and dropping it on a scene to create a token.
 * The given html MUST be a decendent of an item marked with the class .list-item-identifier which is set by calling {set_full_path}
 * @param html {*|jQuery|HTMLElement} the html that corresponds to an item (like a row in the list of tokens)
 * @param specificImage {string} the url of the image to use. If nothing is provided, an image will be selected at random from the token's specified alternative-images.
 */
function enable_draggable_token_creation(html, specificImage = undefined) {
    html.draggable({
        appendTo: "#VTTWRAPPER",
        zIndex: 100000,
        cursorAt: {top: 0, left: 0},
        cancel: '.token-row-gear, .change-token-image-item',
        helper: function(event) {
            console.log("enable_draggable_token_creation helper");
            let draggedRow = $(event.target).closest(".list-item-identifier");
            let draggedItem = find_sidebar_list_item(draggedRow);
            let helper = draggedRow.find("img.token-image").clone();
            if (specificImage !== undefined) {
                helper.attr("src", specificImage);
            } else {
                let randomImage = random_image_for_item(draggedItem);
                helper.attr("src", randomImage);
            }
            helper.addClass("draggable-token-creation");
            return helper;
        },
        start: function (event, ui) {
            console.log("enable_draggable_token_creation start");
            let draggedRow = $(event.target).closest(".list-item-identifier");
            let draggedItem = find_sidebar_list_item(draggedRow);
            let tokenSize = token_size_for_item(draggedItem);
            let width = Math.round(window.CURRENT_SCENE_DATA.hpps) * tokenSize;
            let helperWidth = width / (1.0 / window.ZOOM);
            $(ui.helper).css('width', `${helperWidth}px`);
            $(this).draggable('instance').offset.click = {
                left: Math.floor(ui.helper.width() / 2),
                top: Math.floor(ui.helper.height() / 2)
            };
        },
        drag: function (event, ui) {
            if (event.shiftKey) {
                $(ui.helper).css("opacity", 0.5);
            } else {
                $(ui.helper).css("opacity", 1);
            }
        },
        stop: function (event, ui) {
            event.stopPropagation(); // prevent the mouseup event from closing the modal
            if ($(ui.helper).hasClass("drag-cancelled")) {
                console.log("enable_draggable_token_creation cancelled");
                return;
            }

            let droppedOn = document.elementFromPoint(event.clientX, event.clientY);
            console.log("droppedOn", droppedOn);
            if (droppedOn?.closest("#VTT")) {
                // place a token where this was dropped
                console.log("enable_draggable_token_creation stop");
                let draggedRow = $(event.target).closest(".list-item-identifier");
                let draggedItem = find_sidebar_list_item(draggedRow);
                let hidden = event.shiftKey || window.TOKEN_SETTINGS["hidden"];
                let src = $(ui.helper).attr("src");
                create_and_place_token(draggedItem, hidden, src, event.pageX, event.pageY);
            } else {
                console.log("Not dropping over element", droppedOn);
            }
        }
    });
}

/** When new PC data comes in, this updates the rows with the data found in window.PLAYER_STATS */
function update_pc_token_rows() {
    window.tokenListItems?.filter(listItem => listItem.isTypePC()).forEach(listItem => {
        let row = find_html_row(listItem, tokensPanel.body);
        if (listItem.sheet in window.TOKEN_OBJECTS) {
            row.addClass("on-scene");
            row.find("button.token-row-add").attr("title", `Locate Token on Scene`);
        } else {
            row.removeClass("on-scene");
            row.find("button.token-row-add").attr("title", `Add Token to Scene`);
        }

        let playerData = window.PLAYER_STATS[listItem.sheet];
        if (playerData !== undefined) {
            playerData.abilities.forEach(a => {
                let abilityValue = row.find(`[data-ability='${a.abilityAbbr}']`);
                abilityValue.find(".ability_modifier").text(a.modifier);
                abilityValue.find(".ability_score").text(a.score);

            });
            row.find(".pp-value").text(playerData.pp);
            row.find(".walking-value").text(playerData.walking);
            if (playerData.inspiration) {
                row.find(".inspiration").show();
            } else {
                row.find(".inspiration").hide();
            }
        }
    });
}

/**
 * Creates a {Token} object and places it on the scene.
 * @param listItem {SidebarListItem} the item to create a token from
 * @param hidden {boolean} whether or not the created token should be hidden. Passing undefined will use whatever the global token setting is.
 * @param specificImage {string} the image to use. if undefined, a random image will be used
 * @param eventPageX {number} MouseEvent.pageX if supplied, the token will be placed at this x coordinate, else centered in the view
 * @param eventPageY {number} MouseEvent.pageY if supplied, the token will be placed at this y coordinate, else centered in the view
 * @param disableSnap {boolean} if true, tokens will not snap to the grid. This is false by default and only used when placing multiple tokens
 */
function create_and_place_token(listItem, hidden = undefined, specificImage= undefined, eventPageX = undefined, eventPageY = undefined, disableSnap = false) {

    if (listItem === undefined) {
        console.warn("create_and_place_token was called without a listItem");
        return;
    }

    if (listItem.isTypeFolder() || listItem.isTypeEncounter()) {

        let tokensToPlace = [];

        if (listItem.isTypeFolder()) {
            let fullPath = listItem.fullPath();
            // find and place all items in this folder... but not subfolders
            tokensToPlace = (listItem.fullPath().startsWith(RootFolder.Monsters.path) ? window.monsterListItems : window.tokenListItems)
                .filter(item => !item.isTypeFolder()) // if we ever want to add everything at every subfolder depth, remove this line
                .filter(item => item.folderPath === fullPath);
        } else if (listItem.isTypeEncounter()) {
            let encounterId = listItem.encounterId;
            let encounterMonsterItems = encounter_monster_items[encounterId];
            if (encounterMonsterItems === undefined || encounterMonsterItems.length === 0) {
                let encounterRow = tokensPanel.body.find(`[data-encounter-id='${encounterId}']`);
                encounterRow.find(".sidebar-list-item-row-item").addClass("button-loading");
                refresh_encounter(encounterRow, listItem, function (response) {
                    encounterRow.find(".sidebar-list-item-row-item").removeClass("button-loading");
                    if (response === true) {
                        create_and_place_token(listItem, hidden, specificImage, eventPageX, eventPageY);
                    }
                })
                return;
            }
            window.EncounterHandler.encounters[encounterId].monsters.forEach(shortMonster => {
                let matchingItem = encounterMonsterItems.find(item => item.monsterData.id === shortMonster.id);
                // we only have one of each monster so make new ones
                tokensToPlace.push(SidebarListItem.Monster(matchingItem.monsterData))
            });
        }

        // What's the threshold we should prompt for?
        if (tokensToPlace.length < 10 || confirm(`This will add ${tokensToPlace.length} tokens which could lead to unexpected results. Are you sure you want to add all of these tokens?`)) {
            // place all tokens fanned out from the center of the view
            let center = center_of_view();
            let mapPoint = convert_point_from_view_to_map(center.x, center.y, false); // do our math on the map coordinate space
            let gridSize = Math.min(window.CURRENT_SCENE_DATA.hpps, window.CURRENT_SCENE_DATA.vpps);
            let distanceFromCenter = gridSize * Math.ceil(tokensToPlace.length / 8); // this creates a pretty decent spacing that grows with the size of the token list
            tokensToPlace.forEach((item, index) => {
                let radius = index / tokensToPlace.length;
                let left = mapPoint.x + (distanceFromCenter * Math.cos(2 * Math.PI * radius));
                let top = mapPoint.y + (distanceFromCenter * Math.sin(2 * Math.PI * radius));
                let viewPoint = convert_point_from_map_to_view(left, top); // convert back to view coordinate space because `create_and_place_token` expects view coordinates to be passed in
                create_and_place_token(item, hidden, undefined, viewPoint.x, viewPoint.y, true);
            });
        }
        return;
    }

    // set up whatever you need to. We'll override a few things after
    let options = {...window.TOKEN_SETTINGS};
    options.name = listItem.name;
    options.itemType = listItem.type;
    options.itemId = listItem.id;


    // TODO: handle parent folder options!!!




    switch (listItem.type) {
        case ItemType.Folder:
            console.log("TODO: place all tokens in folder?", listItem);
            break;
        case ItemType.MyToken:
            options = {...options, ...find_token_options_for_list_item(listItem)};
            let tokenSizeSetting = options.tokenSize;
            let tokenSize = parseInt(tokenSizeSetting);
            if (tokenSizeSetting === undefined || typeof tokenSizeSetting !== 'number') {
                tokenSize = 1;
                // TODO: handle custom sizes
            }
            options.tokenSize = tokenSize;
            break;
        case ItemType.PC:
            let pc = window.pcs.find(pc => pc.sheet === listItem.sheet);
            let playerData = window.PLAYER_STATS[listItem.sheet];
            if (pc === undefined) {
                console.warn(`failed to find pc for id ${listItem.sheet}`);
                return;
            }
            options.id = listItem.sheet;
            options.tokenSize = 1;
            options.hp = playerData ? playerData.hp : '';
            options.ac = playerData ? playerData.ac : '';
            options.max_hp = playerData ? playerData.max_hp : '';
            options.color = "#" + get_player_token_border_color(pc.sheet);
            options = {...options, ...find_token_options_for_list_item(listItem)};
            break;
        case ItemType.Monster:
            let hpVal;
            switch (window.TOKEN_SETTINGS['defaultmaxhptype']) {
                case 'max':
                    const hitDiceData = listItem.monsterData.hitPointDice;
                    hpVal = hitDiceData.diceCount * hitDiceData.diceValue + hitDiceData.fixedValue;
                    break;
                case 'roll':
                    hpVal = new rpgDiceRoller.DiceRoll(listItem.monsterData.hitPointDice.diceString).total;
                    break;
                case 'average':
                    hpVal = listItem.monsterData.averageHitPoints;
                    break;
            }
            options.hp = hpVal;
            options.max_hp = hpVal;
            options.sizeId = listItem.monsterData.sizeId;
            options.ac = listItem.monsterData.armorClass;
            options = {...options, ...find_token_options_for_list_item(listItem)};
            options.monster = listItem.monsterData.id;
            options.stat = listItem.monsterData.id;
            let placedCount = 1;
            for (let tokenId in window.TOKEN_OBJECTS) {
                if (window.TOKEN_OBJECTS[tokenId].options.monster === listItem.monsterData.id) {
                    placedCount++;
                }
            }
            if (placedCount > 1) {
                let color = TOKEN_COLORS[(placedCount - 1) % 54];
                console.log(`updating monster name with count: ${placedCount}, and setting color: ${color}`);
                options.name = `${listItem.name} ${placedCount}`;
                options.color = `#${color}`;
            }
            break;
        case ItemType.BuiltinToken:
            options = {...options, ...find_token_options_for_list_item(listItem)};
            options.disablestat = true;
            break;
    }

    options.listItemPath = listItem.fullPath();
    options.hidden = hidden;
    options.imgsrc = random_image_for_item(listItem, specificImage);

    console.log("create_and_place_token about to place token with options", options);

    if (eventPageX === undefined || eventPageY === undefined) {
        place_token_in_center_of_view(options);
    } else {
        let mapPosition = convert_point_from_view_to_map(eventPageX, eventPageY, disableSnap);
        place_token_at_map_point(options, mapPosition.x, mapPosition.y);
    }
}

/**
 * determines the size of the token the given item represents
 * @param listItem {SidebarListItem} the item representing a token
 * @returns {number} the tokenSize that corresponds to the token you're looking for
 */
function token_size_for_item(listItem) {
    switch (listItem.type) {
        case ItemType.Folder:
            return 1;
        case ItemType.MyToken:
            let options = find_token_options_for_list_item(listItem);
            let tokenSizeSetting = options.tokenSize;
            let tokenSize = parseInt(tokenSizeSetting);
            if (tokenSizeSetting === undefined || typeof tokenSizeSetting !== 'number') {
                tokenSize = 1; // TODO: handle custom sizes
            }
            return tokenSize;
        case ItemType.PC:
            return 1;
        case ItemType.Monster:
            switch (listItem.monsterData.sizeId) {
                case 5: return 2;
                case 6: return 3;
                case 7: return 4;
                default: return 1;
            }
        case ItemType.BuiltinToken:
            return 1;
    }
}

/**
 * finds and returns alternative images for the given listItem.
 * @param listItem {SidebarListItem} the item you need a random image for
 * @returns {string[]} a list of url strings
 */
function alternative_images_for_item(listItem) {
    let alternativeImages;
    switch (listItem.type) {
        case ItemType.MyToken:
        case ItemType.PC:
        case ItemType.Monster:
            let customization = find_token_customization(listItem.type, listItem.id);
            if (customization) {
                alternativeImages = customization.alternativeImages();
            }
            break;
        case ItemType.BuiltinToken:
            alternativeImages = builtInTokens.find(bt => listItem.fullPath() === sanitize_folder_path(`${RootFolder.AboveVTT.path}${bt.folderPath}/${bt.name}`) )?.alternativeImages();
            break;
    }

    if (alternativeImages === undefined) {
        alternativeImages = [];
    }

    return alternativeImages;
}

/**
 * finds a random image for the given item
 * @param listItem {SidebarListItem} the item you need a random image for
 * @param specificImage {string|undefined} the url of an image to use if it properly parses; if undefined or unparsable, a random image will be returned instead
 * @returns {string} the url an image associated with the provided listItem
 */
function random_image_for_item(listItem, specificImage) {
    let validSpecifiedImage = parse_img(specificImage);
    if (validSpecifiedImage !== undefined && validSpecifiedImage.length > 0) {
        console.debug("random_image_for_item validSpecifiedImage", validSpecifiedImage);
        return validSpecifiedImage
    }

    let alternativeImages = alternative_images_for_item(listItem);
    if (alternativeImages !== undefined && alternativeImages.length > 0) {
        let randomIndex = getRandomInt(0, alternativeImages.length);
        console.debug("random_image_for_item", alternativeImages, randomIndex);
        return alternativeImages[randomIndex];
    } else {
        console.debug("random_image_for_item alternativeImages empty, returning", listItem.image);
        return listItem.image;
    }
}

/**
 * queues an API request to DDB that searches for monsters
 * @param searchTerm {string} the search term used to search for monsters
 * @param skip {number} the pagination offset. (This is used with the "load more" button)
 * @param callback {function} a function that takes the JSON object returned by the DDB API
 */
function search_monsters(searchTerm, skip, callback) {
    console.log("search_monsters starting");
    if (typeof callback !== 'function') {
        callback = function(){};
    }
    let offset = 0;
    let skipInt = parseInt(skip);
    if (!isNaN(skipInt)) {
        offset = skipInt;
    }
    let searchParam = "";
    if (searchTerm !== undefined && searchTerm.length > 0) {
        searchParam += `&search=${encodeURIComponent(searchTerm)}`;
    }
    let filterParams = monster_search_filter_query_param();
    if (filterParams.length > 0) {
        searchParam += `&${filterParams}`;
    }
    console.log(`search_monsters calling API https://monster-service.dndbeyond.com/v1/Monster?skip=${offset}&take=10${searchParam}`);
    window.ajaxQueue.addDDBRequest({
        url: `https://monster-service.dndbeyond.com/v1/Monster?skip=${offset}&take=10${searchParam}`,
        success: function (responseData) {
            console.log(`search_monsters succeeded`, responseData);
            callback(responseData);
        },
        failure: function (errorMessage) {
            console.warn(`search_monsters failed`, errorMessage);
            callback(false);
        }
    });
}

/** sets up the contextMenu for token rows in the sidebar */
function register_token_row_context_menu() {

    // don't allow the context menu when right clicking on the add button since that adds a hidden token
    tokensPanel.body.find(".sidebar-list-item-row").on("contextmenu", ".token-row-add", function(event) {
        event.preventDefault();
        event.stopPropagation();
        let clickedRow = $(event.target).closest(".list-item-identifier");
        let clickedItem = find_sidebar_list_item(clickedRow);
        create_and_place_token(clickedItem, true);
    });

    $.contextMenu({
        selector: "#tokens-panel .sidebar-list-item-row",
        build: function(element, e) {

            let menuItems = {};

            let rowHtml = $(element);
            let rowItem = find_sidebar_list_item(rowHtml);
            if (rowItem === undefined) {
                console.warn("register_token_row_context_menu failed to find row item", element, e)
                menuItems["unexpected-error"] = {
                    name: "An unexpected error occurred",
                    disabled: true
                };
                return { items: menuItems };
            }

            menuItems["place"] = {
                name: (rowItem.isTypeFolder() || rowItem.isTypeEncounter()) ? "Place Tokens" : "Place Token",
                callback: function(itemKey, opt, originalEvent) {
                    let itemToPlace = find_sidebar_list_item(opt.$trigger);
                    create_and_place_token(itemToPlace);
                }
            };

            menuItems["placeHidden"] = {
                name: (rowItem.isTypeFolder() || rowItem.isTypeEncounter()) ? "Place Hidden Tokens" : "Place Hidden Token",
                callback: function(itemKey, opt, originalEvent) {
                    let itemToPlace = find_sidebar_list_item(opt.$trigger);
                    create_and_place_token(itemToPlace, true);
                }
            };

            if (!rowItem.isTypeFolder() && !rowItem.isTypeEncounter()) {
                // copy url doesn't make sense for folders
                menuItems["copyUrl"] = {
                    name: "Copy Url",
                    callback: function(itemKey, opt, originalEvent) {
                        let itemToCopy = find_sidebar_list_item(opt.$trigger);
                        copy_to_clipboard(itemToCopy.image);
                    }
                };
            }

            if (rowItem.canEdit() ) {
                menuItems["edit"] = {
                    name: "Edit",
                    callback: function(itemKey, opt, originalEvent) {
                        let itemToEdit = find_sidebar_list_item(opt.$trigger);
                        display_sidebar_list_item_configuration_modal(itemToEdit);
                    }
                };
            }

            if (rowItem.isTypeEncounter()) {
                menuItems["refresh"] = {
                    name: "Refresh",
                    callback: function(itemKey, opt, originalEvent) {
                        refresh_encounter(rowHtml, rowItem);
                    }
                };
            }

            if (rowItem.canDelete()) {

                menuItems["border"] = "---";

                // not a built in folder or token, add an option to delete
                menuItems["delete"] = {
                    name: "Delete",
                    callback: function(itemKey, opt, originalEvent) {
                        let itemToDelete = find_sidebar_list_item(opt.$trigger);
                        delete_item(itemToDelete);
                    }
                };
            }


            if (Object.keys(menuItems).length === 0) {
                menuItems["not-allowed"] = {
                    name: "You are not allowed to configure this item",
                    disabled: true
                };
            }
            return { items: menuItems };
        }
    });
}

/**
 * determines if the given path exists or not.
 * @param folderPath {string} the path you are looking for
 * @returns {boolean} whether or not the path exists
 */
function my_token_path_exists(folderPath) {
    return mytokensfolders.find(token => token.folderPath === folderPath) !== undefined || mytokensfolders.find(folder => folder.folderPath === folderPath || sanitize_folder_path(`${folder.folderPath}/${folder.name}`) === folderPath) !== undefined
}

/**
 * Creates a "My Tokens" folder within another "My Tokens" folder
 * @param listItem {SidebarListItem} The folder to create a new folder within
 */
function create_mytoken_folder_inside(listItem) {
    if (!listItem.isTypeFolder() || !listItem.fullPath().startsWith(RootFolder.MyTokens.path)) {
        console.warn("create_mytoken_folder_inside called with an incorrect item type", listItem);
        return;
    }

    let adjustedPath = sanitize_folder_path(listItem.fullPath().replace(RootFolder.MyTokens.path, ""));
    let newFolderName = "New Folder";
    let newFolderCount = mytokensfolders.filter(f => f.folderPath === adjustedPath && f.name.startsWith(newFolderName)).length;
    console.log("newFolderCount", newFolderCount);
    if (newFolderCount > 0) {
        newFolderName += ` ${newFolderCount + 1}`;
    }
    let newFolder = { folderPath: adjustedPath, name: newFolderName, collapsed: true };
    mytokensfolders.push(newFolder);
    let newFolderFullPath = sanitize_folder_path(`${RootFolder.MyTokens.path}${newFolder.folderPath}/${newFolder.name}`);
    did_change_mytokens_items();
    let newListItem = window.tokenListItems.find(i => i.fullPath() === newFolderFullPath);
    display_folder_configure_modal(newListItem);
    expand_all_folders_up_to_item(newListItem);
}

function delete_mytokens_within_folder(listItem) {
    console.groupCollapsed(`delete_mytokens_within_folder`);
    let adjustedPath = sanitize_folder_path(listItem.fullPath().replace(RootFolder.MyTokens.path, ""));

    console.log("about to delete all tokens within", adjustedPath);
    console.debug("before deleting from mytokens", mytokens);
    mytokens = mytokens.filter(token => !token.folderPath.startsWith(adjustedPath));
    console.debug("after deleting from mytokens", mytokens);

    console.log("about to delete all folders within", adjustedPath);
    console.debug("before deleting from mytokensfolders", mytokensfolders);
    mytokensfolders = mytokensfolders.filter(folder => !folder.folderPath.startsWith(adjustedPath))
    console.debug("after deleting from mytokensfolders", mytokensfolders);

    console.groupEnd();
}

function move_mytokens_to_parent_folder(listItem) {
    // this is different from move_mytokens_folder in that it moved everything out of listItem
    console.groupCollapsed(`move_mytokens_to_parent_folder`);
    let adjustedPath = sanitize_folder_path(listItem.fullPath().replace(RootFolder.MyTokens.path, ""));
    let oneLevelUp = sanitize_folder_path(listItem.folderPath.replace(RootFolder.MyTokens.path, ""));

    console.debug("before moving mytokens", mytokens);
    mytokens.forEach(token => {
        if (token.folderPath.startsWith(adjustedPath)) {
            let newFolderPath = sanitize_folder_path(token.folderPath.replace(adjustedPath, oneLevelUp));
            console.log(`moving ${token.name} up one level to ${newFolderPath}`, token);
            token.folderPath = newFolderPath;
        } else {
            console.debug(`not moving token up one level`, token);
        }
    });
    console.debug("after moving mytokens", mytokens);

    console.debug("before moving mytokensfolders", mytokensfolders);
    mytokensfolders = mytokensfolders.filter(folder => sanitize_folder_path(`${folder.folderPath}/${folder.name}`) !== adjustedPath); // remove the folder itself
    mytokensfolders.forEach(f => {
        if (f.folderPath.startsWith(adjustedPath)) {
            let newFolderPath = sanitize_folder_path(f.folderPath.replace(adjustedPath, oneLevelUp));
            console.log("moving folder up to", newFolderPath, f);
            f.folderPath = newFolderPath;
        } else {
            console.debug("not moving folder up", f);
        }
    });
    console.debug("after moving mytokensfolders", mytokensfolders);

    console.groupEnd();
}

function delete_mytokens_folder(listItem) {
    console.log("delete_mytokens_folder", listItem);
    let adjustedPath = sanitize_folder_path(listItem.fullPath().replace(RootFolder.MyTokens.path, ""));
    console.debug("before deleting from mytokensfolders", mytokensfolders);
    mytokensfolders = mytokensfolders.filter(folder => sanitize_folder_path(`${folder.folderPath}/${folder.name}`) !== adjustedPath);
    console.debug("after deleting from mytokensfolders", mytokensfolders);
}

/**
 * Creates a new "My Token" object within a folder
 * @param listItem {SidebarListItem} the folder item to create a token in
 */
function create_token_inside(listItem) {
    if (!listItem.isTypeFolder() || !listItem.fullPath().startsWith(RootFolder.MyTokens.path)) {
        console.warn("create_token_inside called with an incorrect item type", listItem);
        return;
    }

    let newTokenName = "New Token";
    const newTokenCount = window.TOKEN_CUSTOMIZATIONS
        .filter(tc => tc.parentId === listItem.id && tc.name().startsWith(newTokenName))
        .length;


    // let folderPath = listItem.fullPath().replace(RootFolder.MyTokens.path, "");
    // let newTokenCount = mytokens.filter(t => t.folderPath === folderPath && t.name.startsWith(newTokenName)).length;
    console.log("newTokenCount", newTokenCount);
    if (newTokenCount > 0) {
        newTokenName += ` ${newTokenCount + 1}`;
    }

    let customization = TokenCustomization.MyToken(
        uuid(),
        listItem.id,
        { name: newTokenName }
    );
    persist_token_customization(customization, function (didSucceed, error) {
        console.log("create_token_inside created a new item", customization);
        did_change_mytokens_items();
        const newItem = window.tokenListItems.find(li => li.type === ItemType.MyToken && li.id === customization.id);
        if (didSucceed && newItem) {
            display_token_configuration_modal(newItem);
        } else {
            console.error("Failed to create My Token", customization, error);
            showGenericAlert();
        }
    });
}

/**
 * presents a SidebarPanel modal for configuring the given item
 * @param listItem {SidebarListItem} the item to configure
 * @param placedToken {undefined|Token} the token object that is on the scene
 */
function display_token_configuration_modal(listItem, placedToken = undefined) {
    switch (listItem?.type) {
        case ItemType.MyToken:
        case ItemType.Monster:
        case ItemType.PC:
            break;
        default:
            console.warn("display_token_configuration_modal was called with incorrect item type", listItem);
            return;
    }

    let customization = find_token_customization(listItem.type, listItem.id);
    if (customization === undefined) {
        console.warn("display_token_configuration_modal failed to find a customization object matching listItem:", listItem);
        alert("Failed to find a matching token customization object.");
        return;
    }

    // close any that are already open just to be safe
    close_sidebar_modal();
    let sidebarPanel = new SidebarPanel("token-configuration-modal");
    display_sidebar_modal(sidebarPanel);

    let name = listItem.name;
    let tokenSize = token_size_for_item(listItem);

    sidebarPanel.updateHeader(name, "", "When placing tokens, one of these images will be chosen at random. Right-click an image for more options.");
    redraw_token_images_in_modal(sidebarPanel, listItem, placedToken);

    // add a "remove all" button between the body and the footer
    let removeAllButton = build_remove_all_images_button(sidebarPanel, listItem, placedToken);
    sidebarPanel.body.after(removeAllButton);
    if (alternative_images_for_item(listItem).length === 0) {
        removeAllButton.hide();
    }

    let inputWrapper = sidebarPanel.inputWrapper;


    // we want this as a function so we can easily update the label as the user adds/removes images
    const determineLabelText = function() {
        if (alternative_images_for_item(listItem).length === 0) {
            return "Replace The Default Image";
        } else {
            return "Add More Custom Images";
        }
    }

    // images
    let addImageUrl = function (newImageUrl) {
        customization.addAlternativeImage(newImageUrl);
        persist_token_customization(customization);
        redraw_token_images_in_modal(sidebarPanel, listItem, placedToken);
        removeAllButton.show();
        inputWrapper.find(".token-image-modal-footer-title").text(determineLabelText());
    };

    // MyToken name input handler
    const rename = function(newName) {
        if (newName !== undefined && newName.length > 0) {
            console.log("update token name to", newName);
            customization.setTokenOption("name", newName);
            persist_token_customization(customization);
            sidebarPanel.updateHeader(newName, "", "When placing tokens, one of these images will be chosen at random. Right-click an image for more options.");
            redraw_token_images_in_modal(sidebarPanel, listItem, placedToken);
        }
    };


    let imageUrlInput = sidebarPanel.build_image_url_input(determineLabelText(), addImageUrl);
    inputWrapper.append(imageUrlInput);

    if (listItem.isTypeMyToken()) {

        // MyToken name
        inputWrapper.append($(`<div class="token-image-modal-footer-title" style="width:100%;padding-left:0px">Token Name</div>`));
        let nameInput = $(`<input data-previous-name="${name}" title="token name" placeholder="my token name" name="addCustomName" type="text" style="width:100%" value="${name === undefined ? '' : name}" />`);
        nameInput.on('keyup', function (event) {
            if (event.key === "Enter" && event.target.value !== undefined && event.target.value.length > 0) {
                rename(event.target.value);
            } else if (event.key === "Escape") {
                $(event.target).blur();
            }
        });
        nameInput.on('focusout', function (event) {
            rename(event.target.value);
        });
        inputWrapper.append(nameInput);
    }

    if (typeof customization !== "object") {
        console.error("Ummm... we somehow don't have a TokenCustomization object?", customization, listItem);
        return;
    }

    // token size
    let tokenSizeInput = build_token_size_input(tokenSize, function (newSize) {
        customization.setTokenOption("tokenSize", newSize);
        persist_token_customization(customization);
        decorate_modal_images(sidebarPanel, listItem, placedToken);
    });
    inputWrapper.append(tokenSizeInput);

    // image scale
    let startingScale = customization.tokenOptions.imageSize || 1;
    let imageScaleWrapper = build_token_image_scale_input(startingScale, function (imageSize) {
        customization.setTokenOption("imageSize", imageSize);
        persist_token_customization(customization);
        decorate_modal_images(sidebarPanel, listItem, placedToken);
    });
    inputWrapper.append(imageScaleWrapper);

    let tokenOptionsButton = build_override_token_options_button(sidebarPanel, listItem, placedToken, customization.tokenOptions, function(name, value) {
        customization.setTokenOption(name, value);
    }, function () {
        persist_token_customization(customization);
        redraw_settings_panel_token_examples(customization.tokenOptions);
        decorate_modal_images(sidebarPanel, listItem, placedToken);
    });
    inputWrapper.append(tokenOptionsButton);
    inputWrapper.append(`<br />`);


    // // submit form button
    // let saveButton = $(`<button class="sidebar-panel-footer-button" style="width:100%;padding:8px;margin-top:8px;margin-left:0px;">Save</button>`);
    // saveButton.on("click", function (event) {
    //     let nameInput = $(event.target).parent().find("input[name='addCustomName']");
    //     if (nameInput.length > 0 && nameInput.val().length > 0) {
    //         rename(nameInput.val());
    //     }
    //
    //     // just in case, they pasted a url, but didn't press the enter key or click the Add button, we should grab the url and save it
    //     if (listItem.image === undefined || listItem.image.length === 0) {
    //         let imageUrl = $(event.target).parent().find(`input[name='addCustomImage']`)[0].value;
    //         if (imageUrl !== undefined && imageUrl.length > 0) {
    //             addImageUrl(imageUrl);
    //         }
    //     }
    //
    //     did_change_mytokens_items();
    //     close_sidebar_modal();
    // });
}

function build_override_token_options_button(sidebarPanel, listItem, placedToken, options, updateValue, didChange) {
    let tokenOptionsButton = $(`<button class="sidebar-panel-footer-button" style="margin: 10px 0px 10px 0px;">Override Token Options</button>`);
    tokenOptionsButton.on("click", function (clickEvent) {
        build_and_display_sidebar_flyout(clickEvent.clientY, function (flyout) {
            const overrideOptions = token_setting_options().map(option => convert_option_to_override_dropdown(option));
            let optionsContainer = build_sidebar_token_options_flyout(overrideOptions, options, function(name, value) {
                updateValue(name, value);
            }, didChange);
            optionsContainer.prepend(`<div class="sidebar-panel-header-explanation">Every time you place this token on the scene, these settings will be used. Setting the value to "Default" will use the global settings which are found in the settings tab.</div>`);
            flyout.append(optionsContainer);
            position_flyout_left_of(sidebarPanel.container, flyout);
            redraw_settings_panel_token_examples(options);
            decorate_modal_images(sidebarPanel, listItem, placedToken);
        });
    });
    return tokenOptionsButton;
}

/**
 * displays a SidebarPanel modal with the details of the given Builtin token. This is not editable, but shows multiple images, that can be drag and dropped onto the scene
 * @param listItem {SidebarListItem} the builtin item to display a modal for
 * @param placedToken {Token|undefined} undefined if this modal does not represnet a token that is placed on the scene; else the Token object that corresponds to a token that is placed on the scene
 */
function display_builtin_token_details_modal(listItem, placedToken) {
    if (!listItem?.isTypeBuiltinToken()) {
        console.warn("display_builtin_token_details_modal was called with incorrect item type", listItem);
        return;
    }

    // close any that are already open just to be safe
    close_sidebar_modal();

    let sidebarPanel = new SidebarPanel("builtin-token-details-modal");
    display_sidebar_modal(sidebarPanel);
    sidebarPanel.updateHeader(listItem.name, "", "When placing tokens, one of these images will be chosen at random. Right-click an image for more options.");

    redraw_token_images_in_modal(sidebarPanel, listItem, placedToken);
}

/**
 * Clears the body of the given sidebarPanel and adds a new element for every alternative image the listItem has
 * @param sidebarPanel {SidebarPanel} the modal to display objects in
 * @param listItem {SidebarListItem} the list item the modal represents
 * @param placedToken {Token|undefined} undefined if this modal does not represnet a token that is placed on the scene; else the Token object that corresponds to a token that is placed on the scene
 */
function redraw_token_images_in_modal(sidebarPanel, listItem, placedToken) {
    if (sidebarPanel === undefined) {
        console.warn("redraw_token_images_in_modal was called without a sidebarPanel");
        return;
    }
    if (listItem === undefined) {
        console.warn("redraw_token_images_in_modal was called without a listItem");
        return;
    }

    let modalBody = sidebarPanel.body
    modalBody.empty();

    const buildTokenDiv = function(imageUrl) {
        let parsedImage = parse_img(imageUrl);
        let tokenDiv = build_alternative_image_for_modal(parsedImage, find_token_options_for_list_item(listItem), placedToken);
        if (placedToken?.isMonster()) {
            tokenDiv.attr("data-monster", placedToken.options.monster);
        }
        set_full_path(tokenDiv, listItem.fullPath());
        enable_draggable_token_creation(tokenDiv, parsedImage);
        return tokenDiv;
    }

    // clone our images array instead of using a reference so we don't accidentally change the current images for all tokens
    // we also need to parse and compare every image to know if we need to add the placedToken image
    let alternativeImages = alternative_images_for_item(listItem).map(image => parse_img(image));

    let placedImg = parse_img(placedToken?.options?.imgsrc);
    if (placedImg.length > 0 && !alternativeImages.includes(placedImg)) {
        // the placedToken image has been changed by the user so put it at the front
        let tokenDiv = buildTokenDiv(placedImg);
        tokenDiv.attr("data-token-id", placedToken.options.id);
        modalBody.append(tokenDiv);
    }

    if (alternativeImages.length === 0 && placedImg !== parse_img(listItem.image)) {
        // if we don't have any alternative images, show the default image
        let tokenDiv = buildTokenDiv(listItem.image);
        modalBody.append(tokenDiv);
    }

    for (let i = 0; i < alternativeImages.length; i++) {
        let tokenDiv = buildTokenDiv(alternativeImages[i]);
        modalBody.append(tokenDiv);
    }

    if (alternative_images_for_item(listItem).length === 0) {
        sidebarPanel.footer.find(".token-image-modal-url-label-add-wrapper .token-image-modal-url-label-wrapper .token-image-modal-footer-title").text("Replace The Default Image");
    } else {
        sidebarPanel.footer.find(".token-image-modal-url-label-add-wrapper .token-image-modal-url-label-wrapper .token-image-modal-footer-title").text("Add More Custom Images");
    }
}

/**
 * builds an HTML element for the given image
 * @param image {string} the url to display in the image
 * @param options {object} the Token.options or the TokenCustomization.tokenOptions to use when drawing the element
 * @param placedToken {Token} the Token object that as been placed on the scene; else undefined
 * @returns {*|jQuery|HTMLElement} the HTML that you can add to a sidebarPanel modal
 */
function build_alternative_image_for_modal(image, options, placedToken) {
    let mergedOptions = {};
    if (options !== undefined) {
        mergedOptions = {...mergedOptions, ...options};
    }
    if (placedToken !== undefined) {
        mergedOptions = {...mergedOptions, ...placedToken.options};
    }
    mergedOptions.imgsrc = image;
    let tokenDiv = build_example_token(mergedOptions);
    if (placedToken !== undefined) {
        // the user is changing their token image, allow them to simply click an image
        // we don't want to allow drag and drop from this modal
        tokenDiv.attr("data-token-id", placedToken.options.id);
        tokenDiv.on("click", function() {
            placedToken.options.imgsrc = parse_img(image);
            close_sidebar_modal();
            placedToken.place_sync_persist();
        });
    }
    tokenDiv.addClass("custom-token-image-item");
    return tokenDiv;
}

/**
 * iterates over all the images in a sidebarPanel modal and udpates them to match the settings of the given listItem.
 * @param sidebarPanel {SidebarPanel} the modal to update
 * @param listItem {SidebarListItem|undefined} the item the modal represents
 * @param placedToken {Token|undefined} the token on the scene
 */
function decorate_modal_images(sidebarPanel, listItem, placedToken) {
    if (listItem === undefined && placedToken === undefined) {
        console.warn("decorate_modal_images was called without a listItem or a placedToken");
        return;
    }
    let options = find_token_options_for_list_item(listItem);
    let items = sidebarPanel.body.find(".example-token");
    for (let i = 0; i < items.length; i++) {
        let item = $(items[i]);
        let imgsrc = item.find("img.token-image").attr("src");
        let tokenDiv = build_alternative_image_for_modal(imgsrc, options, placedToken);
        item.replaceWith(tokenDiv);
        set_full_path(tokenDiv, listItem.fullPath());
        enable_draggable_token_creation(tokenDiv, imgsrc);
    }
}

/** writes mytokens and mytokensfolders to localStorage */
function persist_my_tokens() {
    localStorage.setItem("MyTokens", JSON.stringify(mytokens));
    localStorage.setItem("MyTokensFolders", JSON.stringify(mytokensfolders));
    persist_token_folders_remembered_state();
}

function persist_token_folders_remembered_state() {
    if (window.tokenListItems === undefined) return;
    let rememberedFolderState = {};
    let foldersToRemember = window.tokenListItems
        .filter(item => item.isTypeFolder() && item.fullPath().startsWith(RootFolder.AboveVTT.path))
        .concat(tokens_rootfolders);
    foldersToRemember.forEach(f => {
        rememberedFolderState[f.fullPath()] = f.collapsed
    });
    localStorage.setItem("TokensFolderRememberedState", JSON.stringify(rememberedFolderState));
}

function update_token_folders_remembered_state() {
    let tokenItems = window.tokenListItems.concat(tokens_rootfolders);
    if(localStorage.getItem('TokensFolderRememberedState') != null){
        let rememberedStates = JSON.parse(localStorage.getItem('TokensFolderRememberedState'));
        tokenItems.forEach(item => {
            let state = rememberedStates[item.fullPath()];
            if (state === true || state === false) {
                item.collapsed = state;
            }
        });
    }
}

function fetch_encounter_monsters_if_necessary(clickedRow, clickedItem) {
    if (clickedItem.isTypeEncounter() && clickedRow.find(".folder-item-list").is(":empty") && !clickedItem.activelyFetchingMonsters && clickedItem.encounterId !== undefined) {
        fetch_and_inject_encounter_monsters(clickedRow, clickedItem);
    }
}

function refresh_encounter(clickedRow, clickedItem, callback) {
    if (typeof callback !== 'function') {
        callback = function(){};
    }
    window.EncounterHandler.fetch_encounter(clickedItem.encounterId, function(response) {
        if (response === false) {
            console.warn("Failed to refresh encounter", response);
            callback(false);
        } else {
            clickedItem.name = response.name;
            clickedItem.description = response.flavorText;
            clickedRow.find(".sidebar-list-item-row-details-title").text(response.name);
            clickedRow.find(".sidebar-list-item-row-details-subtitle").text(response.flavorText);
            fetch_and_inject_encounter_monsters(clickedRow, clickedItem, callback);
        }
    });
}

function fetch_and_inject_encounter_monsters(clickedRow, clickedItem, callback) {
    if (typeof callback !== 'function') {
        callback = function(){};
    }
    clickedItem.activelyFetchingMonsters = true;
    clickedRow.find(".sidebar-list-item-row-item").addClass("button-loading");
    window.EncounterHandler.fetch_encounter_monsters(clickedItem.encounterId, function (response, errorType) {
        clickedItem.activelyFetchingMonsters = true;
        clickedRow.find(".sidebar-list-item-row-item").removeClass("button-loading");
        if (response === false) {
            console.warn("Failed to fetch encounter monsters", errorType);
            callback(false);
        } else {
            let monsterItems = response
                .map(monsterData => SidebarListItem.Monster(monsterData))
                .sort(SidebarListItem.sortComparator);
            encounter_monster_items[clickedItem.encounterId] = monsterItems;
            update_monster_item_cache(monsterItems); // let's cache these so we won't have to fetch them again if the user places them on the scene
            inject_encounter_monsters();
            callback(true);
        }
    });
}

function inject_encounter_monsters() {
    for (const encounterId in encounter_monster_items) {
        let monsterItems = encounter_monster_items[encounterId];
        let encounter = window.EncounterHandler.encounters[encounterId];
        let encounterRow = tokensPanel.body.find(`[data-encounter-id='${encounterId}']`);
        let encounterMonsterList = encounterRow.find(`> .folder-item-list`);
        if (encounter?.groups === undefined || encounter.groups === null || encounterMonsterList.length === 0 || encounterRow.length === 0 || monsterItems === undefined) {
            continue;
        }
        encounterMonsterList.empty();
        encounter.groups.sort((lhs, rhs) => lhs.order - rhs.order).forEach(encounterGroup => {
            let groupDiv = $(`<div class="encounter-monster-group"></div>`);
            encounterMonsterList.append(groupDiv);

            let monsters = encounter.monsters
                .filter(m => m.groupId === encounterGroup.id)
                .sort((lhs, rhs) => lhs.order - rhs.order);

            if (monsters.length > 1) {
                groupDiv.addClass("grouped");
                if (typeof encounterGroup.name == "string" && encounter.name.length > 0) {
                    groupDiv.append(`<div>${encounterGroup.name}</div>`);
                }
            }

            monsters.forEach(shortMonster => {
                let monsterItem = monsterItems.find(item => item.monsterData.id === shortMonster.id);
                let monsterRow = build_sidebar_list_row(monsterItem);
                enable_draggable_token_creation(monsterRow);
                groupDiv.append(monsterRow);
            });
        });
    }
}

/** A convenience function to be called after any "My Tokens" are updated */
function did_change_mytokens_items() {
    // persist_my_tokens();
    rebuild_token_items_list();
    update_token_folders_remembered_state();
    redraw_token_list();
    // filter_token_list(tokensPanel.body.find(".token-search").val());
}

/**
 * creates an iframe that loads a monster stat block for the given item
 * @param listItem {SidebarListItem} the list item representing the monster that you want to display a stat block for
 */
function open_monster_item(listItem) {
    if (!listItem.isTypeMonster()) {
        console.warn("open_monster_item was called with the wrong item type", listItem);
        return;
    }

    let iframe = $(`<iframe id='monster-details-page-iframe'></iframe>`);
    iframe.css({
        "width": "100%",
        "height": "100%",
        "top": "0px",
        "left": "0px",
        "position": "absolute",
        "border": "none",
        "z-index": 10
    });
    tokensPanel.container.append(iframe);

    let rowHtml = find_html_row(listItem, tokensPanel.body);
    console.log(listItem.fullPath(), rowHtml);
    rowHtml.addClass("button-loading");
    iframe.on("load", function(event) {
        rowHtml.removeClass("button-loading");
        if (!this.src) {
            // it was just created. no need to do anything until it actually loads something
            return;
        }

        let contents = $(event.target).contents();
        contents.find("#site > footer").hide();
        contents.find("#site-main > header.main").hide();
        contents.find("#site-main").css("padding-top", 0);
        contents.find(".site-bar").hide();
        contents.find(".ad-container").hide();
        contents.find(".homebrew-comments").hide();

        // move the image below the stat block
        let image = contents.find(".detail-content > .image");
        let statBlock = contents.find(".detail-content > .mon-stat-block");
        statBlock.after(image);

        let closeButton = build_close_button();
        contents.find(".page-header__primary > .page-heading").append(closeButton);
        closeButton.css({
            "position": "fixed",
            "top": "10px",
            "right": "10px",
            "box-shadow": "rgb(51 51 51) 0px 0px 60px 0px"
        });
        closeButton.on("click", function () {
            $("#monster-details-page-iframe").remove();
        });

        contents.find(".main.content-container").attr("style", "padding:0!important");
        contents.find(".more-info.details-more-info").css("padding", "8");
        contents.find(".mon-stat-block").css("column-count", "1");
        contents.find("a").attr("target", "_blank");

        scan_creature_pane(contents, listItem.monsterData.name, listItem.monsterData.avatarUrl);

        contents.find("body").append(`<style>
            button.avtt-roll-button {
                /* lifted from DDB encounter stat blocks  */
                color: #b43c35;
                border: 1px solid #b43c35;
                border-radius: 4px;
                background-color: #fff;
                white-space: nowrap;
                font-size: 14px;
                font-weight: 600;
                font-family: Roboto Condensed,Open Sans,Helvetica,sans-serif;
                line-height: 18px;
                letter-spacing: 1px;
                padding: 1px 4px 0;
            }
            </style>
        `);

    });


    iframe.attr("src", listItem.monsterData.url);
}

/** calls the DDB API to fetch all PCs in the campaign... It currently throws a CORS error */
function fetch_characters() {

    // TODO: figure out the CORS errors here. This exact API is called from the page we're trying to call this from, and it works for them, but not for us :(

    console.log("fetch_characters starting");
    let pcIds = window.pcs
        .filter(pc => pc.sheet.includes("/")) // only pcs that have a valid sheet structure
        .map(pc => parseInt(pc.sheet.split("/").pop())) // grab the id which is the last component of the path
        .filter(id => id !== undefined); // ignore any ids that failed to parse
    let body = JSON.stringify({"characterIds": pcIds});
    console.log("fetch_characters", body);
    window.ajaxQueue.addDDBRequest({
        type: "POST",
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        url: `https://character-service-scds.dndbeyond.com/v1/characters`,
        data: body,
        success: function (responseData) {
            console.log("fetch_characters success", responseData);
        },
        failure: function (errorMessage) {
            console.log("fetch_characters failure", errorMessage);
        }
    });
}

/**
 * translates a DDB challenge rating identifier to a human-readable string
 * @param crId {number} the challenge rating identifier to translate
 * @returns {string} a human-readable challenge rating
 */
function convert_challenge_rating_id(crId) {
    switch (crId) {
        case 0: return "0"; // ???
        case 1: return "0";
        case 2: return "1/8";
        case 3: return "1/4";
        case 4: return "1/2";
        default: return `${crId - 4}`;
    }
}

function display_monster_filter_modal() {

    let iframe = $(`<iframe id='monster-filter-iframe'></iframe>`);
    iframe.css({
        "width": "100%",
        "height": "100%",
        "top": "0px",
        "left": "0px",
        "position": "absolute",
        "border": "none",
        "z-index": -10
    });
    tokensPanel.display_sidebar_loading_indicator("Fetching Filters");
    tokensPanel.container.append(iframe);
    iframe.attr("scrolling", "no");
    iframe.on("load", function(event) {

        if (!this.src) {
            // it was just created. no need to do anything until it actually loads something
            return;
        }

        $(event.target).contents().find("body").addClass("prevent-sidebar-modal-close");
        $(event.target).contents().find(".monster-listing__header button").click();
        $(event.target).contents().find(".popup-overlay").css("background", "rgb(235, 241, 245)");
        $(event.target).contents().find(".popup-content").css({
            "width": "100%",
            "height": "100%",
            "max-width": "100%",
            "max-height": "100%",
            "margin": 0
        });
        $(event.target).contents().find(".popup-overlay").on("click", function (e) {
            if ($(e.target).hasClass("popup-overlay")) {
                e.stopPropagation();
            }
        });

        let closeButton = build_close_button();
        closeButton.css({
            "position": "fixed",
            "top": "10px",
            "right": "10px",
            "box-shadow": "rgb(51 51 51) 0px 0px 60px 0px"
        });
        closeButton.on("click", function (clickEvent) {
            clickEvent.stopPropagation();
            close_monster_filter_iframe();
        });
        $(event.target).contents().find(".popup-content").prepend(closeButton);

        tokensPanel.remove_sidebar_loading_indicator();
        iframe.css({ "z-index": 10 });
    });
    iframe.attr("src", `https://www.dndbeyond.com/encounters/${window.EncounterHandler.avttId}/edit`);

}

function close_monster_filter_iframe() {
    let sidebarMonsterFilter = $("#monster-filter-iframe");

    if(localStorage.getItem('DDBEB-monster-filters') != null) {
        // the user has the "remember filters" option checked... let's grab our data and move on
        read_local_monster_search_filters();
        sidebarMonsterFilter.remove();
        tokensPanel.remove_sidebar_loading_indicator(); // if the user double clicks, we might remove iframe before dismissing the loading indicator
        let textValue = tokensPanel.header.find("input[name='token-search']").val();
        filter_token_list(textValue);
    } else {
        // we need to enable the "remember filters" option, grab our data, then disable the "remember filters" option
        sidebarMonsterFilter.hide(); // don't let them see us messing with the UI
        let rememberButton = $(sidebarMonsterFilter[0].contentDocument.body).find(".qa-monster-filters_remember");
        rememberButton.click();
        setTimeout(function() { // make sure we let the "remember filter" click propagate before we harvest that data
            read_local_monster_search_filters();
            rememberButton.click();
            sidebarMonsterFilter.remove();
            tokensPanel.remove_sidebar_loading_indicator(); // if the user double clicks, we might remove iframe before dismissing the loading indicator
            let textValue = tokensPanel.header.find("input[name='token-search']").val();
            filter_token_list(textValue);
        });
    }
}

function read_local_monster_search_filters() {
    if(localStorage.getItem('DDBEB-monster-filters') != null){
        monster_search_filters = $.parseJSON(localStorage.getItem('DDBEB-monster-filters'));
    } else {
        monster_search_filters = {};
    }
    if (Object.keys(monster_search_filters).length > 0) {
        $(".monster-filter-button").css("color", "#1b9af0");
    } else {
        $(".monster-filter-button").css("color", "#838383");
    }
    console.log("monster_search_filters", monster_search_filters);
}

/** @returns {string} the query params to use when searching for monsters via the DDB API */
function monster_search_filter_query_param() {
    let queryParams = []; // a list of strings in the format `key=value`
    for (let filterKey in monster_search_filters) {
        let filterValue = monster_search_filters[filterKey];
        if (Array.isArray(filterValue)) {
            for (let i = 0; i < filterValue.length; i++) {
                let currentValue = filterValue[i];
                queryParams.push(`${filterKey}=${currentValue}`);
            }
        } else {
            queryParams.push(`${filterKey}=${filterValue}`);
        }
    }
    return queryParams.join("&");
}

function register_custom_token_image_context_menu() {
    $.contextMenu({
        selector: ".custom-token-image-item",
        build: function(element, e) {
            let items = {};
            if (!element.hasClass("change-token-image-item")) {
                items.place = {
                    name: "Place Token",
                    callback: function (itemKey, opt, originalEvent) {
                        let itemToPlace = find_sidebar_list_item(opt.$trigger);
                        let specificImage = undefined;
                        let imgSrc = opt.$trigger.find("img.token-image").attr("src");
                        if (imgSrc !== undefined && imgSrc.length > 0) {
                            specificImage = imgSrc;
                        }
                        create_and_place_token(itemToPlace, false, specificImage);
                    }
                };
                items.placeHidden = {
                    name: "Place Hidden Token",
                    callback: function (itemKey, opt, originalEvent) {
                        let itemToPlace = find_sidebar_list_item(opt.$trigger);
                        let specificImage = undefined;
                        let imgSrc = opt.$trigger.find("img.token-image").attr("src");
                        if (imgSrc !== undefined && imgSrc.length > 0) {
                            specificImage = imgSrc;
                        }
                        create_and_place_token(itemToPlace, true, specificImage);
                    }
                };
            }
            items.copy = {
                name: "Copy Url",
                callback: function (itemKey, opt, e) {
                    let selectedItem = $(opt.$trigger[0]);
                    let imgSrc = selectedItem.find("img").attr("src");
                    copy_to_clipboard(imgSrc);
                }
            };
            if (!element.hasClass("custom-token-image-item")) {
                items.border = "---";
                items.remove = {
                    name: "Remove",
                    callback: function (itemKey, opt, originalEvent) {
                        let selectedItem = $(opt.$trigger[0]);
                        let imgSrc = selectedItem.find("img").attr("src");
                        let listItem = find_sidebar_list_item(opt.$trigger);

                        // if they are removing the image that is set on a token, ask them if they really want to remove it
                        let placedTokenId = selectedItem.attr("data-token-id");
                        let placedToken = window.TOKEN_OBJECTS[placedTokenId];
                        if (placedToken !== undefined && placedToken.options.imgsrc === imgSrc) {
                            let continueRemoving = confirm("This image is set on the token. Removing it will remove the image on the token as well. Are you sure you want to remove this image?")
                            if (!continueRemoving) {
                                return;
                            }
                            placedToken.options.imgsrc = "";
                            placedToken.place_sync_persist();
                        }

                        if (listItem?.isTypeMyToken() || listItem?.isTypeMonster() || listItem?.isTypePC()) {
                            let customization = find_token_customization(listItem.type, listItem.id);
                            if (!customization) {
                                console.error("register_custom_token_image_context_menu Remove failed to find a token customization object matching listItem: ", listItem);
                                showGenericAlert();
                                return;
                            }
                            customization.removeAlternativeImage(imgSrc);
                            persist_token_customization(customization);
                            redraw_token_images_in_modal(window.current_sidebar_modal, listItem, placedToken);
                        } else {
                            console.error("register_custom_token_image_context_menu Remove attempted to remove a custom image with an invalid type. listItem:", listItem);
                            showGenericAlert();
                            return;
                        }
                        selectedItem.remove();
                    }
                };
            }
            return { items: items };
        }
    });
}

function build_remove_all_images_button(sidebarPanel, listItem, placedToken) {
    // add a "remove all" button between the body and the footer
    let removeAllButton = $(`<button class="token-image-modal-remove-all-button" title="Reset this token back to the default image.">Remove All Custom Images</button>`);
    removeAllButton.on("click", function(event) {
        let tokenName = listItem !== undefined ? listItem.name : placedToken.options.name
        let customization;
        if (listItem !== undefined) {
            customization = find_token_customization(listItem.type, listItem.id);
        }
        if (customization === undefined && placedToken !== undefined) {
            if (placedToken.isMonster()) {
                customization = find_token_customization(ItemType.Monster, placedToken.options.id);
            } else if (placedToken.isPlayer()) {
                customization = find_token_customization(ItemType.PC, placedToken.options.id);
            } else {
                customization = find_token_customization(ItemType.MyToken, placedToken.options.id);
            }
        }
        if (!customization) {
            console.error("build_remove_all_images_button failed to find token customization for listItem:", listItem, ", placedToken:", placedToken);
            showGenericAlert();
            return;
        }
        if (window.confirm(`Are you sure you want to remove all custom images for ${tokenName}?\nThis will reset the token images back to the default`)) {
            customization.removeAllAlternativeImages();
            persist_token_customization(customization);
            redraw_token_images_in_modal(sidebarPanel, listItem, placedToken);
            $(event.currentTarget).hide();
        }
    });
    return removeAllButton;
}

function find_token_options_for_list_item(listItem) {
    if (listItem.isTypeBuiltinToken()) {
        return find_builtin_token(listItem.fullPath());
    } else {
        return find_token_customization(listItem.type, listItem.id)?.tokenOptions || {};
    }
}

function display_change_image_modal(placedToken) {
    if (placedToken === undefined) {
        console.warn("Attempted to call display_change_image_modal without a token");
        return;
    }

    close_sidebar_modal();
    let sidebarPanel = new SidebarPanel("token-change-image-modal");
    display_sidebar_modal(sidebarPanel);

    /// update the modal header
    sidebarPanel.updateHeader(placedToken.options.name, "Token Images", "Click an image below to update your token or enter a new image URL at the bottom.");

    /// draw tokens in the body
    let listItem = list_item_from_token(placedToken);
    redraw_token_images_in_modal(sidebarPanel, listItem, placedToken);
    sidebarPanel.body.find(".custom-token-image-item").addClass("change-token-image-item");

    // this will be called when the user enters a new url
    const add_token_customization_image = function(imageUrl) {
        if(imageUrl.startsWith("data:")){
            alert("You cannot use urls starting with data:");
            return;
        }
        placedToken.options.imgsrc = parse_img(imageUrl);
        close_sidebar_modal();
        placedToken.place_sync_persist();
    };

    let imageUrlInput = sidebarPanel.build_image_url_input("Use a different image", add_token_customization_image);
    sidebarPanel.inputWrapper.append(imageUrlInput);

    let inputWrapper = sidebarPanel.inputWrapper;
    sidebarPanel.footer.find(`.token-image-modal-add-button`).remove();
    // allow them to use the new url for the placed token without saving the url for all future tokens
    let onlyForThisTokenButton = $(`<button class="sidebar-panel-footer-button" title="This url will be used for this token only. New tokens will continue to use the images shown above.">Set for this token only</button>`);
    onlyForThisTokenButton.on("click", function(event) {
        let imageUrl = $(`input[name='addCustomImage']`)[0].value;
        if (imageUrl !== undefined && imageUrl.length > 0) {
            add_token_customization_image(imageUrl);
        }
    });
    inputWrapper.append(onlyForThisTokenButton);

    inputWrapper.append($(`<div class="sidebar-panel-header-explanation" style="padding:4px;">You can change the image for all tokens of this type by clicking the gear button on the token row in the Tokens tab.</div>`));
}

const fetch_and_cache_scene_monster_items = mydebounce( (clearCache = false) => {
    console.log("fetch_and_cache_scene_monster_items");
    if (clearCache) {
        cached_monster_items = {};
    }
    let monsterIds = [];
    for (let id in window.TOKEN_OBJECTS) {
        let token = window.TOKEN_OBJECTS[id];
        if (token.isMonster()) {
            let alreadyCached = cached_monster_items[token.options.monster];
            if (alreadyCached === undefined) {
                // we only want monsters that we haven't already cached. no need to keep fetching the same things
                monsterIds.push(token.options.monster);
            }
        }
    }
    if (monsterIds.length === 0) {
        console.log("fetch_and_cache_scene_monster_items no monsters to fetch");
        return;
    }
    console.log("fetch_and_cache_scene_monster_items calling fetch_monsters with ids: ", monsterIds);
    window.EncounterHandler.fetch_monsters(monsterIds, function (response) {
        if (response !== false) {
            update_monster_item_cache(response.map(m => SidebarListItem.Monster(m)));
        }
    });
});

function update_monster_item_cache(newItems) {
    newItems.forEach(item => cached_monster_items[item.monsterData.id] = item);
}

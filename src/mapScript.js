// Just for the showcase, every added marker needs a unique pk (id)
let newPK = 299;

let map;
const TILE_SIZE = 300;

// Small script in template sets this letiable
let IS_USER_STAFF;

// Marker that was most recently clicked
let currentClickedMarker;
// For adding new markers through context menu, is made equal to an "event"
let currentContextLocation;
// Is a marker being given a new position right now?
let isMarkerBeingMoved = false;

let infoWindow;
let infoWindowMenuContent;

const markerArray = [];

$.ajaxSetup({
	// Retrieves csrf cookie and sets it for all ajax requests
	// Not needed in the showcase, but does need to be there for the real thing
	beforeSend: function (xhr, settings) {
		if (settings.type == 'POST' || settings.type == 'PUT' || settings.type == 'DELETE') {
			function getCookie(name) {
				let cookieValue = null;
				if (document.cookie && document.cookie != '') {
					let cookies = document.cookie.split(';');
					for (let i = 0; i < cookies.length; i++) {
						let cookie = jQuery.trim(cookies[i]);
						// Does this cookie string begin with the name we want?
						if (cookie.substring(0, name.length + 1) == (name + '=')) {
							cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
							break;
						}
					}
				}
				return cookieValue;
			}
			if (!(/^http:.*/.test(settings.url) || /^https:.*/.test(settings.url))) {
				// Only send the token to relative URLs i.e. locally.
				xhr.setRequestHeader("X-CSRFToken", getCookie('csrftoken'));
			}
		}
	}
});

function initMap() {
	$( document ).ready(function() {

		// All lets which are dependant on the document are here:
		const contextMenuWidth = $("#context-menu").width() + 15;

		$("#loading-subtitle").html("creating map");

		// Init of map and other basic things
		map = new google.maps.Map(document.getElementById('map'), {
			center: {
				lat: -30,
				lng: -33,
			},
			zoom: 3,
			streetViewControl: false,
			mapTypeId: 'houses_map',
			mapTypeControl: false,
		});

		$("#loading-subtitle").html("retrieving houses");

		// Gets all the markers from the db
		$.ajax({
			dataType: "json",
			url: "api_responses/markers.json",
			success: function(data) {
				$("#loading-subtitle").html("placing houses");

				//tempArray = JSON.parse(data);
				tempArray = data;

				tempArray.forEach(function(obj) {
					obj.fields.lat = parseFloat(obj.fields.lat);
					obj.fields.lng = parseFloat(obj.fields.lng);
					addMarker(obj);
				});
				$("#loading-subtitle").html("all houses placed");

				/*
				This listener triggers only once on the first idle. An 'idle'
				occurs when the map first finalizes loading, so we use
				this as the cue to remove the loading screen
				*/
				// TODO: Try and break this in anyway or setup a failsafe
				google.maps.event.addListenerOnce(map, 'idle', function (event) {
					$("#map-loading").fadeOut(150);
				});
			},
			error: function(data) {
				console.log(data);
				$("#map-loading").html("<h1>Error! The houses could not be loaded in.</h1>")
				.append("<i>Please reload the page or try again later.</i>")
			}
		});

		// Search box implemented as custom google maps control
		const topLeftMenu = $("#search-div");
		map.controls[google.maps.ControlPosition.TOP_LEFT].push(topLeftMenu[0]);

		// Custom map initialisation
		let housesMapType = new google.maps.ImageMapType({
			// Where to get the tile pictures from and how
			getTileUrl: function (coord, zoom) {
				let normalizedCoord = getNormalizedCoord(coord, zoom);
				if (!normalizedCoord) {
					return null;
				}
				let bound = Math.pow(2, zoom);

				return 'tiles/' + zoom + '/' + normalizedCoord.x + '/' + normalizedCoord.y + '.png';
			},
			tileSize: new google.maps.Size(TILE_SIZE, TILE_SIZE),
			maxZoom: 4,
			minZoom: 3,
			radius: 0,
			name: 'Houses'
		});

		// Bounds for limiting camera
		let customBounds = new google.maps.LatLngBounds(
			new google.maps.LatLng(-73, -45),
			new google.maps.LatLng(41, 107)
		);

		// Info window, one for all markers
		infoWindow = new google.maps.InfoWindow({
			maxWidth: 400,
		});

		// Square bounds visualised, simply uncomment. Useful for debugging.
		//Remember that the bounds take the easiest way, which may be around
		//the other "side" of the map.

		/*let rectangle = new google.maps.Rectangle({
			strokeColor: '#FF0000',
			strokeOpacity: 0.8,
			strokeWeight: 2,
			fillColor: '#FF0000',
			fillOpacity: 0,
			map: map,
			bounds: customBounds,
		});*/

		// Converts latlng to pixel coordinates
		function convertPoint(latLng) {
			let topRight = map.getProjection().fromLatLngToPoint(map.getBounds().getNorthEast());
			let bottomLeft = map.getProjection().fromLatLngToPoint(map.getBounds().getSouthWest());
			let scale = Math.pow(2, map.getZoom());
			let worldPoint = map.getProjection().fromLatLngToPoint(latLng);
			return new google.maps.Point((worldPoint.x - bottomLeft.x) * scale, (worldPoint.y - topRight.y) * scale);
		}

		// FUNCTIONS

		// For adding a COMPLETELY NEW marker, DIFFERENT FROM addMarker(). This will add it to markerArray as well
		function addNewMarker(event) {

			// Marker information to be sent to create a new marker in the db
			datatosend = {
				lat: event.latLng.lat(),
				lng: event.latLng.lng()
			}

			$.ajax({
				type: 'POST',
				url: 'api_responses/new_marker.json',
				contentType: 'application/json; charset=utf-8',
				dataType: 'json',
				data: JSON.stringify(datatosend),
				success: function(data) {

					// [0] because a one object array is returned
					//response = JSON.parse(data)[0];
					response = data[0];
					response.pk = newPK;
					newPK++;
					response.fields.lat = datatosend.lat;
					response.fields.lng = datatosend.lng;
					//response.fields.lat = parseFloat(response.fields.lat);
					//response.fields.lng = parseFloat(response.fields.lng);

					markerArray.push(response)
					addMarker(response)
				},
				error: function(data) {
					alert("Status code: " + data.status + ". Marker could not be added, reload the page or try again later.");
				}
			});

			$("#context-menu").css({"display": "none"});
		}


		// LISTENERS (JQUERY AND MAP)

		if (IS_USER_STAFF) {
			// Adds new marker when button is clicked
			$("#addNewMarkerBtn").click(function() {
				addNewMarker(currentContextLocation);
			});
		}

		/*
		Search function. It is VERY basic and likely unoptimised. Just checks whether the searched
		word is in any markers fields.
		*/
		$("#marker-search-form").submit(function(event) {
			event.preventDefault();

			$("#search-results-box").html('');

			let searchTerm = $("#marker-search-input").val().toUpperCase();

			// This will be filled up with values later
			let relevantPropertys = [];

			// Creates a new array with every marker that returns true
			let searchResults = $.grep(markerArray, function(marker) {
				info = marker.info;
				relevantPropertys = [];
				for (let property in info) {

					// No null values
					if (info.hasOwnProperty(property) && info[property] != null) {
						// If a property is NOT in this array, it gets added to relevantPropertys. This is because users wont be searching by id, lat etc
						if ($.inArray(property, ["id", "lat", "lng", "page", "published", "house_icon"]) == -1) {
							relevantPropertys.push((info[property]).toUpperCase());
						}
					}
				}

				let containsTerm = relevantPropertys.some(function(property) {
					return property.includes(searchTerm);
				});
				return containsTerm;
			});

			// If there are results, add DOM elements
			if (searchResults.length) {

				// Displays each search result
				searchResults.forEach(function(marker) {
					info = marker.info;
					// Constructs a .search-result for each result and adds it to #search-results-box
					addedResult = "<div class='search-result' data-marker-id='" + info.id + "'>";
					addedResult += "<h4>" + info.name + "</h4>"

					// Typically this would check whether some info is present so as to not show nothing
					true ? addedResult += "<small><b>SmallInfo: </b>" + 1234 + "</small>" : {};
					true ? addedResult += "<small><b>DetailTwo: </b>" + "Lorem ipsum" + "</small>" : {};

					// Description
					addedResult += "<p>";
					// If its longer than certain amount of characters, it gets sliced
					info.description.length > 130 ? addedResult += info.description.slice(0, 130) + "..." : addedResult += info.description;

					addedResult += "</p>";

					addedResult += "</div>";

					// Adds the search result to the DOM
					$("#search-results-box").append(addedResult);

					// Adds an event to focus on relevant marker
					$(".search-result[data-marker-id=" + info.id + "]").on("click", function() {
						map.setCenter({lat: info.lat, lng: info.lng});
						markerClick(marker);
					});
				});
			}
			// No results
			else {
				$("#search-results-box").html("<p style='text-align: center; margin-top: 7px;'>No results found</p>");
			}
		});

		// Clears the search results
		$("#marker-clear-button").click(function(event) {
			event.preventDefault();
			$("#search-results-box").html('');
		});

		// Closes the sidenav associated with the closebtn
		$(".sidenav .closebtn").click(function() {
			let $this = $(this);

			$("#" + $this.data("sidenav")).width("0px");
		});

		// Opens the associated side modal
		$("#show-map-sidemodal-button").click(function(event) {
			// Since this button is in a form, prevent it from triggering form + reload
			event.preventDefault();
			let $this = $(this);

			$("#" + $this.data("sidenav")).width("250px");
		})

		// Bounds changed
		google.maps.event.addListener(map, 'bounds_changed', function () {
			// Turns off the context menu
			$("#context-menu").css({"display": "none"});

			// Sets camera back when out of bounds
			if (!customBounds.contains(map.getCenter())) {
				let c = map.getCenter(),
					x = c.lng(),
					y = c.lat(),
					maxX = customBounds.getNorthEast().lng(),
					maxY = customBounds.getNorthEast().lat(),
					minX = customBounds.getSouthWest().lng(),
					minY = customBounds.getSouthWest().lat();

				if (x < minX) x = minX;
				if (x > maxX) x = maxX;
				if (y < minY) y = minY;
				if (y > maxY) y = maxY;

				map.setCenter(new google.maps.LatLng(y, x));
			}
		});

		// Right click on map
		google.maps.event.addListener(map, 'rightclick', function (event) {

			if (IS_USER_STAFF) {
				// Opens a context menu at the click location
				pixelpoint = convertPoint(event.latLng);

				// If the context menu goes out of the page, move it back the correct amount
				if ((pixelpoint.x + contextMenuWidth) > window.innerWidth) {
					pixelpoint.x -= (pixelpoint.x + contextMenuWidth - window.innerWidth);
				}
				$("#context-menu").css({"top": pixelpoint.y, "left": pixelpoint.x, "display": "block"});
				currentContextLocation = event;
			}

		});

		// Left click on map
		google.maps.event.addListener(map, 'click', function (event) {
			//console.log("LAT: " + event.latLng.lat() + " | LNG: " + event.latLng.lng());

			// If a marker position is being changed by an admin:
			if (isMarkerBeingMoved) {
				currentClickedMarker.setPosition(event.latLng);
			}
		});

		// Sets custom map to initialised map
		map.mapTypes.set('houses_map', housesMapType);
		map.setMapTypeId('houses_map');
	});
}

// Function that is called whenever a marker is clicked
// or a click has to be simulated
function markerClick(marker) {
	// If a marker is being edited, reset it. This has to be done before
	// currentClickedMarker is changed
	if (isMarkerBeingMoved) {
		resetMarkerPos();
		isMarkerBeingMoved = false;
	}

	currentClickedMarker = marker;
	$("#openMoreInfo").attr("href", "/api/houses/page/?id=" + currentClickedMarker.info.id)

	// Sets the "Edit" to the relevant marker link, obviously should only happen if user is an admin
	if (IS_USER_STAFF) {
		$("#adminEdit").attr("href", "/cms/familyhouses/marker/edit/" + currentClickedMarker.info.id)
	}

	setInfoWinContent(currentClickedMarker.info);
	infoWindow.open(map, currentClickedMarker);
}

// Sets the content of the html info window content
function setInfoWinContent(content) {
	// Put all fields that need to be shown here:
	// MODAL DEPENDENT
	$("#info-name").html(content.name);
	$("#info-desc").html(content.description);

	// Shows/hides the "Open more" link depending on whether the marker has a linked page
	content.page ? $("#info-openmore").show() : $("#info-openmore").hide();

	if (IS_USER_STAFF) {
		// Everything for staff only:
		$("#info-id").html("ID: " + content.id);

		if (content.published) {
			$("#publishText").css("display", "inline")
			$("#publishBtn").css("display", "none")
		}
		else {
			$("#publishBtn").css("display", "inline")
			$("#publishText").css("display", "none")
		}
	}

	infoWindowMenuContent = $("#infoWindowMenuContent").prop('outerHTML');
	infoWindow.setContent(infoWindowMenuContent)
}

// Only adds marker to the map
function addMarker(obj) {
	// Temp marker that is added to markerArray. It's "info" field contains all the db info of said marker
	obj.marker = new google.maps.Marker({
		position: {"lat": obj.fields.lat, "lng": obj.fields.lng},
		map: map,
		icon: "img/house-" + obj.fields.house_icon + ".png",
	});

	obj.marker.info = obj.fields;
	if (!obj.id) {
		obj.marker.info.id = obj.pk;
	}
	else {
		obj.marker.info.id = obj.pk;
	}

	// Marker listener
	obj.marker.addListener('click', function() {
		markerClick(obj.marker)
	});

	markerArray.push(obj.marker)
}

// Used for showing tiles
function getNormalizedCoord(coord, zoom) {
	let y = coord.y;
	let x = coord.x;

	// Tile range in one direction range is dependent on zoom level
	// 0 = 1 tile, 1 = 2 tiles, 2 = 4 tiles, 3 = 8 tiles, etc
	let tileRange = 1 << zoom;

	if (y < 0 || y >= tileRange) {
		return null;
	}

	if (x < 0 || x >= tileRange) {
		return null;
	}

	return {
		x: x,
		y: y
	};
}

// Delete marker function
function deleteMarker() {
	if (!confirm("Are you sure you would like to delete this marker? This cannot be reversed!")) {
		return;
	}

	$.ajax({
		type: 'POST',
		url: 'api_responses/empty_response.json',
		contentType: 'application/json; charset=utf-8',
		dataType: 'json',
		data: JSON.stringify({id: currentClickedMarker.info.id}),
		success: function(data) {
			currentClickedMarker.setMap(null);
		},
		error: function(data) {
			alert("Status code: " + data.status + ". Marker could not be deleted, reload the page or try again later.");
		}
	});
};

// Sends publish POST
function publishMarker() {
	if (!confirm("Are you sure you would like to publish this marker?")) {
		return;
	}

	infoWindow.setContent($("#loading-span").html());
	console.log("Publishing marker");

	$.ajax({
		type: 'POST',
		url: 'api_responses/empty_response.json',
		contentType: 'application/json; charset=utf-8',
		dataType: 'json',
		data: JSON.stringify({id: currentClickedMarker.info.id}),
		success: function(data) {
			currentClickedMarker.info.published = true;
			infoWindow.setContent(infoWindowMenuContent);
			setInfoWinContent(currentClickedMarker.info);
		},
		error: function(data) {
			infoWindow.setContent(infoWindowMenuContent);
			setInfoWinContent(currentClickedMarker.info);
			alert("Status code: " + data.status + ". Marker could not be published, reload the page or try again later.");
		}
	});
}

// ------ 3 functions used for changing markers position ------
// Allows the marker position to be changed.
function dragMarker() {
	isMarkerBeingMoved = true;

	// Messy hack to disable the info window "close" button
	$(".gm-style-iw+div").css("display", "none");

	infoWindowMenuContent = $("#infoWindowDrag").prop('outerHTML');
	infoWindow.setContent(infoWindowMenuContent)
}

// If marker is being position edited and the action is cancelled this resets is back to where it was
function resetMarkerPos() {
	currentClickedMarker.setPosition({"lat": currentClickedMarker.info.lat, "lng": currentClickedMarker.info.lng});
	$(".gm-style-iw+div").css("display", "block");
	isMarkerBeingMoved = false;
}

// Sets a new position and also sends a POST to the db
function setNewMarkerPos() {
	if (!confirm("Are you sure you would like to change this marker's position?")) {
		return;
	}

	// Marker information to be sent to create a new marker in the db
	datatosend = {
		id: currentClickedMarker.info.id,
		lat: currentClickedMarker.getPosition().lat(),
		lng: currentClickedMarker.getPosition().lng()
	}

	$.ajax({
		type: 'POST',
		url: 'api_responses/empty_response.json',
		contentType: 'application/json; charset=utf-8',
		dataType: 'json',
		data: JSON.stringify(datatosend),
		success: function(data) {
			// Sets the new data
			currentClickedMarker.info.lat = datatosend.lat;
			currentClickedMarker.info.lng = datatosend.lng;

			$(".gm-style-iw+div").css("display", "block");
			isMarkerBeingMoved = false;
			setInfoWinContent(currentClickedMarker.info);
		},
		error: function(data) {
			resetMarkerPos();
			setInfoWinContent(currentClickedMarker.info);
			alert("Status code: " + data.status + ". Marker could not be edited, reload the page or try again later.");
		}
	});
}

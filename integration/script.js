// Helper functions
function set_svg_size(svg_elem, c_width, c_height) {
	// Takes sizes as an input, and returns the two sizes
	// that optimizes a 19:9 ratio
	adapted_w = c_height * 2.5
	adapted_h = c_width / 2.5


	console.log(c_width, c_height, adapted_h, adapted_w)

	if (adapted_h > c_height) {
		svg
			.attr("width", adapted_w)
			.attr("height", c_height)
		width = adapted_w;
		height = c_height;
	} else {
		svg
			.attr("width", c_width)
			.attr("height", adapted_h)
		width = c_width;
		height = adapted_h;

	}

	return { width, height };
}

function define_points(packet_ref, ip_data, i, proj_obj) {

	host_ip = "127.0.0.1"
	points = [{}, {}, {}]

	send = ip_data[packet_ref.Sender]
	rec = ip_data[packet_ref.Receiver]

	if (send != null && rec != null) {
		send_coords = projection([+send.long, +send.lat])
		points[0] = { x: send_coords[0], y: send_coords[1] }

		rec_coords = projection([+rec.long, +rec.lat])
		points[2] = { x: rec_coords[0], y: rec_coords[1] }
		p_mode = ""
		if (packet_ref.Sender == host_ip) {
			country = rec.country
			town = rec.city
			p_mode = "sender"
			p_domain = rec.domain
		} else if (packet_ref.Receiver == host_ip) {
			country = send.country
			town = send.city
			p_mode = "receiver"
			p_domain = send.domain
		}

		points[1] = { x: (points[0].x + points[2].x) / 2, y: (points[0].y + points[2].y) / 2 - Math.abs(points[0].x - points[2].x) / 6 }

		packet_ref.points = points
		packet_ref.country = country
		packet_ref.city = town
		packet_ref.mode = p_mode
		packet_ref.domain = p_domain
	}
}

function add_geolocation_to_packet_json(p_iter, ip_data, time_scale) {
	max_time = 0
	nb_packets = p_iter.length
	current_prog = 0


	p_iter.forEach(function (packet, i) {

		if (new Date(packet.Time) > time_scale.domain()[1]) time_scale.domain([time_scale.domain()[0], new Date(packet.Time)])
		define_points(packet, ip_data, i)

		// Plotting the data binding progess
		if ((10 * i / nb_packets) > current_prog) {
			console.log(10 * current_prog + " - " + (10 * ++current_prog) + "%")
		}


	})
}

function arc_generator(x1, y1, x2, y2, radius) {

	x_m = (x1 + x2) / 2
	y_m = (y1 + y2) / 2

	dxy = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

	x_r = x_m - (x2 - x1) / dxy * radius
	y_r = y_m - (y2 - y1) / dxy * radius

	alpha = Math.asin((y2 - y1) / dxy)
	beta = Math.atan(dxy / 2 / radius)

	arc = d3.arc()
		.outerRadius(radius + 0.1)
		.innerRadius(radius)
		.startAngle(alpha + beta)
		.endAngle(alpha - beta)

}

function drawing_box_init(svg_elem) {

	if (mouse_mode == "draw_box") {

		d3.select("#geo_window").remove()

		rect_x = d3.event.x
		rect_y = d3.event.y

		console.log(svg_elem)

		svg_elem.selectAll("rect").append("rect")
			.attr("id", "geo_window")
			.attr("x", rect_x)
			.attr("y", rect_y)
			.attr("width", 0)
			.attr("height", 0)

		console.log(rect_x, rect_y)
	}
}

function drawing_box_drag() {
	if (mouse_mode == "draw_box") {
		width = d3.event.x - rect_x
		height = d3.event.y - rect_y

		d3.select("#geo_window")
			.attr("width", width)
			.attr("height", height)

		console.log(width, height)
	}

}

function drawStreams(elem, it_packets, path_obj, base_beta, line_obj, gaussian_generator, mode, sessions, time_scale) {      // Creating the tooltip object

	var streams_tooltip = global_cont.append('div')
		.attr('class', 'hidden tooltip');

	console.log(sw_begin, time_scale.invert(sw_begin))

	test = elem.select("#streams")
	test.remove()

	g = elem.append("g").attr("id", "streams")

	g.selectAll("path")
		.data(it_packets)
		.enter()
		.append("path")
		.attr("class", "stream")
		.attr("style", function (d) {
			res = ""
			if (sessions.indexOf(d.Session) > -1 && new Date(d.Time) > time_scale.invert(sw_begin) && new Date(d.Time) < time_scale.invert(sw_end))
				alpha = 0.2
			else {
				alpha = 0; res = "display: none;"
			}

			color = "rgba(0, 153, 204, " + alpha + ")"
			if (mode == "up_down") {
				if (d.mode == "sender")
					color = "rgba(102, 153, 0, " + alpha + ")"
				else if (d.mode == "receiver")
					color = "rgba(204, 51, 0, " + alpha + ")"
			} else if (mode == "session") {
				color_dict = d3.rgb(color_scale(sessions.indexOf(d.Session) + 1))
				color = "rgba(" + color_dict.r + ", " + color_dict.g + ", " + color_dict.b + ", " + alpha + ")"
			}

			color = "stroke :" + color + ";"


			return res + color
		})
		.attr("path", path_obj)
		.on('mousemove', function (d) {
			var mouse = d3.mouse(svg.node()).map(function (d) {
				return parseInt(d);
			})
			streams_tooltip.classed('hidden', false)
				.attr('style', 'left:' + (0 + mouse[0] + 15) +
					'px; top:' + (0 + mouse[1] - 50) + 'px')
				.html(time_formatter(new Date(d.Time)) + "<br />Country: " + d.country + "<br />City: " + d.city + "<br />Length: " + d.Length + " bytes" +
					"<br />Domain: " + d.domain);

		})
		.on('mouseout', function () {
			streams_tooltip.classed('hidden', true);
		})
		// .transition()
		// .duration(1)
		// .delay(function(d, i) { return 0.1*i;})
		.attr("d", function (d) {
			if (d.points != undefined) {
				line_obj.curve(d3.curveBundle.beta(base_beta + 2 * gaussian_generator() / 10)); return line_obj(d.points)
			}
		}
		)

}

function zoomed() {
	svg.selectAll("path")
		.attr("transform", d3.event.transform)
}

function plot_slider_init(elem, begin_x, begin_y, width, height, min_t, max_t) {
	// Creating the tooltip object
	var tooltip = global_cont.append('div')
		.attr('class', 'hidden tooltip');

	vertical_padding = 20
	horizontal_padding = 20

	time_scale = d3.scaleTime()
		.domain([min_t, max_t])
		.range([begin_x + horizontal_padding, begin_x + width - horizontal_padding])

	values_up_scale = d3.scaleLog().base(10)
		.domain([1, 1])
		.range([height / 2, vertical_padding])

	values_down_scale = d3.scaleLog().base(10)
		.domain([1, 1])
		.range([height / 2, height - vertical_padding])


	sw_begin = time_scale.range()[0] + (time_scale.range()[1] - time_scale.range()[0]) / 4
	sw_end = sw_begin + (time_scale.range()[1] - time_scale.range()[0]) / 2

	var sliding_window = slider.append("rect").attr("id", "sliding_window")
		.attr("x", sw_begin)
		.attr("y", vertical_padding)
		.attr("height", (values_down_scale.range()[1] - values_up_scale.range()[1]))
		.attr("width", sw_end - sw_begin)
		.attr("style", "cursor: move;")

	tAxis = d3.axisBottom(time_scale)
	yUpAxis = d3.axisLeft(values_up_scale).ticks(5)
	yDownAxis = d3.axisLeft(values_down_scale).ticks(5)


	return { sliding_window, tooltip, time_scale, values_up_scale, values_down_scale, height, vertical_padding, tAxis, yUpAxis, yDownAxis }

}

function plot_slider_bars(elem, packets, mode, sessions, time_scale, values_up_scale, values_down_scale, tooltip, height, vertical_padding, begin_x, begin_y) {

	time_formatter = d3.timeFormat("%Y %b, %e - %H:%M:%S")
	color_scale = d3.scaleOrdinal(d3.schemeCategory10)
	console.log(time_scale.domain(), time_scale(new Date(2019, 2, 6, 23, 0, 0, 0)))
	elem.selectAll(".packet").remove()

	elem.selectAll("rect")
		.data(packets).enter()
		.append("rect")
		.attr("class", function (d) {
			if (sessions.indexOf(d.Session) > -1)
				return "packet";
			else return "packet hidden"
		})
		.attr("x", d => time_scale(new Date(d.Time)))
		.attr("y", function (d) {
			if (d.mode == "sender") {
				res = values_up_scale(d3.max([1, d.Length]))
			}
			else
				res = height / 2

			return res
		})
		.attr("width", 0.5)
		.attr("height", function (d, i) {
			res = 0
			if (d.mode == "sender")
				res = values_up_scale(1) - values_up_scale(d3.max([1, d.Length]))
			else if (d.mode == "receiver")
				res = values_down_scale(d3.max([1, d.Length])) - values_down_scale(1)

			return res
		})
		.style("fill", function (d) {
			alpha = 0.1
			res = "rgba(0, 153, 204, " + alpha + ")"
			if (mode == "up_down") {
				if (d.mode == "sender")
					res = "rgba(102, 153, 0, " + alpha + ")"
				else if (d.mode == "receiver")
					res = "rgba(204, 51, 0, " + alpha + ")"

			} else if (mode == "session") {
				color_dict = d3.rgb(color_scale(sessions.indexOf(d.Session) + 1))
				res = "rgba(" + color_dict.r + ", " + color_dict.g + ", " + color_dict.b + ", " + alpha + ")"
			}

			return res
		})
		.on('mousemove', function (d) {
			var mouse = d3.mouse(svg.node()).map(function (d) {
				return parseInt(d);
			})
			tooltip.classed('hidden', false)
				.attr('style', 'left:' + (mouse[0] + 15) +
					'px; top:' + (mouse[1] - 50) + 'px')
				.html(time_formatter(new Date(d.Time)) + "<br />Country: " + d.country + "<br />City: " + d.city + "<br />Length: " + d.Length + " bytes" +
					"<br />Domain: " + d.domain);
		})
		.on('mouseout', function () {
			tooltip.classed('hidden', true);
		});

}

function gaussian_generator() {
	u1 = Math.random()
	u2 = Math.random()

	R = Math.sqrt(-2 * Math.log(u1))
	theta = 2 * Math.PI * u2

	return R * Math.sin(theta) / 3
}

function updateSessions(){
	var checkboxes = document.getElementsByName("session")
	sessions = []
	checkboxes.forEach(checkbox => {
		if (checkbox.checked === true){
			sessions.push(checkbox.value)
		}
	})
	console.log(sessions)
	drawStreams(svg, packets_iterator_global, path, base_beta, line_obj, gaussian_generator, mode, sessions, time_scale)

}

function updateMode(){
	var radioButtons = document.getElementsByName("mode")
	radioButtons.forEach(radioButton => {
		if (radioButton.checked === true){
			mode = radioButton.value
		}
	})
	console.log("Mode = " + mode)
	drawStreams(svg, packets_iterator_global, path, base_beta, line_obj, gaussian_generator, mode, sessions, time_scale)
}

// ****************************
// * Constants initialization *
// ****************************
var client_w = document.documentElement.clientWidth,
	client_h = document.documentElement.clientHeight,
	map_w = client_w, map_h = client_h
ma_time = 0;
host = "192.168.0.17";


// Creating the canvas
var global_cont = d3.select("main")
	.append("div")
	.attr("id", "global_container")

var svg = global_cont.append("svg")

var slider = global_cont.append("svg").attr("id", "slider")

var slider_zoomed = global_cont.append("svg").attr("id", "slider_zoomed")


//new_dims = set_svg_size(svg, map_w, map_h)
svg.attr("width", 1000).attr("height", 500)
new_dims = { "width": 1000, "height": 500 }

var slider_height = 180

slider.attr("width", new_dims['width'])
	.attr("height", slider_height)
slider_zoomed.attr("width", new_dims['width'])
	.attr("height", slider_height)

// TODO : Prévoir un scaling dépendendant de la taille de la fenêtre pour l'initialisation
var projection = d3.geoNaturalEarth1()
	.center([0, 8.12])
	.scale(200);

var path = d3.geoPath() // d3.geo.path avec d3 version 3
	.projection(projection);

var packets_iterator_global;
var base_beta = 0.5;
var line_obj;

d3.json("world_topography_50.json", function (geojson_elem) {
	svg.selectAll("path").append("g")
		.data(geojson_elem.features)
		.enter()
		.append("path")
		.attr("d", d => path(d))
	var curve_obj = d3.curveBundle.beta(0.5)

	line_obj = d3.line()
		.x(d => d.x)
		.y(d => d.y)
		.curve(d3.curveBundle.beta(0.5))

	

	var sessions = ["work", "administrative", "leisure"]

	var sl_begin_x = 0, sl_begin_y = new_dims['height']

	min_t = new Date(2019, 2, 6, 20, 0, 0, 0);
	max_t = new Date(2019, 2, 7, 3, 0, 0, 0);

	slider_elements = plot_slider_init(slider, 0, new_dims['height'], new_dims['width'], slider_height, min_t, max_t)

	mode = "session" // ou "up_down"

	zoom_bh = d3.zoom()
		.scaleExtent([1, 16])
		.on("zoom", zoomed)

	rect_x = 0, rect_y = 0;

	// *********************
	// * Readers functions *
	// *********************
	
	// Opening the packets json
	d3.json("packets_data.json", function (packets_iterator) {
		packets_iterator_global = packets_iterator

		// Opening the IPs json
		d3.json("ip_reference_data.json", function (ips_data) {

			max_up_length = 0
			max_down_length = 0


			function update_sw_pos(sw, lh, rh, ts) {
				clearTimeout()

				sw_begin = d3.max([ts.range()[0], d3.min([sw_begin + +d3.event.dx, ts.range()[1]])])
				sw_end = d3.max([ts.range()[0], d3.min([sw_end + +d3.event.dx, ts.range()[1]])])

				sw
					.attr("x", sw_begin)
					.attr("width", sw_end - sw_begin)
				lh
					.attr("x", sw_begin)
				rh
					.attr("x", sw_end)

				setTimeout(drawStreams(svg, packets_iterator, path, base_beta, line_obj, gaussian_generator, mode, sessions, time_scale), 30)
			}

			function resize_sw_left(sw, lh, rh, ts) {
				clearTimeout()

				sw_begin = d3.max([ts.range()[0], d3.min([sw_begin + +d3.event.dx, ts.range()[1]])])

				sw
					.attr("x", sw_begin)
					.attr("width", sw_end - sw_begin)

				lh
					.attr("x", sw_begin)

				setTimeout(drawStreams(svg, packets_iterator, path, base_beta, line_obj, gaussian_generator, mode, sessions, time_scale), 30)
			}

			function resize_sw_right(sw, lh, rh, ts) {
				clearTimeout()
				sw_end = d3.max([ts.range()[0], d3.min([sw_end + +d3.event.dx, ts.range()[1]])])

				sw
					.attr("width", sw_end - sw_begin)
				rh
					.attr("x", sw_end)

				setTimeout(drawStreams(svg, packets_iterator, path, base_beta, line_obj, gaussian_generator, mode, sessions, time_scale), 30)
			}

			add_geolocation_to_packet_json(packets_iterator, ips_data, slider_elements.time_scale)

			packets_iterator.forEach(packet_ref => {
				if (packet_ref.mode == "sender") {
					if (max_up_length < packet_ref.Length)
						max_up_length = packet_ref.Length
				} else {
					if (max_down_length < packet_ref.Length)
						max_down_length = packet_ref.Length
				}
			}
			)
			slider_elements.values_up_scale.domain([1, max_up_length])
			slider_elements.values_down_scale.domain([1, max_down_length])

			t_axis = slider.append("g")
				.attr("transform", "translate(" + 0 + ", " + slider_height / 2 + ")")
				.call(slider_elements.tAxis)

			slider.append("g")
				.attr("transform", "translate(" + vertical_padding + ", " + 0 + ")")
				.call(slider_elements.yUpAxis)
			slider.append("g")
				.attr("transform", "translate(" + vertical_padding + ", " + 0 + ")")
				.call(slider_elements.yDownAxis)


			plot_slider_bars(slider, packets_iterator, mode, sessions, slider_elements.time_scale,
				slider_elements.values_up_scale, slider_elements.values_down_scale, slider_elements.tooltip, slider_elements.height, slider_elements.vertical_padding, sl_begin_x, sl_begin_y)

			var left_handle = slider.append("rect")
				.attr("class", "handle")
				.attr("style", "fill: rgba(180, 65, 23, 0); cursor: ew-resize;")
				.attr("x", sw_begin - 5)
				.attr("y", vertical_padding)
				.attr("height", values_down_scale.range()[1] - values_up_scale.range()[1])
				.attr("width", 10)
			var right_handle = slider.append("rect")
				.attr("class", "handle")
				.attr("style", "fill: rgba(180, 65, 23, 0); cursor: ew-resize;")
				.attr("x", sw_end - 5)
				.attr("y", vertical_padding)
				.attr("height", values_down_scale.range()[1] - values_up_scale.range()[1])
				.attr("width", 10)

			drawStreams(svg, packets_iterator, path, base_beta, line_obj, gaussian_generator, mode, sessions, time_scale)

			svg.call(zoom_bh);




			ended = function () { console.log("test"); drawStreams(svg, packets_iterator, path, base_beta, line_obj, gaussian_generator, mode, sessions, time_scale) }

			slider_elements.sliding_window.call(d3.drag()
				.on("drag", d => update_sw_pos(slider_elements.sliding_window, left_handle, right_handle, slider_elements.time_scale)))

			left_handle.call(d3.drag()
				.on("drag", d => resize_sw_left(slider_elements.sliding_window, left_handle, right_handle, slider_elements.time_scale)))
			right_handle.call(d3.drag()
				.on("drag", d => resize_sw_right(slider_elements.sliding_window, left_handle, right_handle, slider_elements.time_scale)))



		}) // Closing the IPs json

	}) // Closing the packets json

})

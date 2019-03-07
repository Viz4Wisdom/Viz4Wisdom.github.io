import json
import csv
import datetime as dt
import subprocess
from urllib.parse import urlparse
import re
import requests

LOCAL_IPV4 = 'Your local IPV4'
LOCAL_IPV6 = 'Your local IPV6'
delta = dt.timedelta(seconds=1)

def format_packet(row, session):
    time = dt.datetime.fromisoformat(row['Time'])
    if row['Source'] == LOCAL_IPV4 or row['Source'] == LOCAL_IPV6:
        sender = 'local'
    else:
        sender = row['Source']

    if row['Destination'] == LOCAL_IPV4 or row['Destination'] == LOCAL_IPV6:
        receiver = 'local'
    else:
        receiver = row['Destination']

    return {
        "Paquet Id": row['No.'],
        "Time": time,
        "Sender": sender,
        "Receiver": receiver,
        "Length": int(row['Length']),
        "Count": 1,
        "Session": session
    }


def format_packets(file, session):
    formatted_packets = [{"Sender": 'local', "Receiver": 'local', "Time": dt.datetime(2000,1,1), "Length": 0}]
    last_packets = [{"Sender": 'local', "Receiver": 'local', "Time": dt.datetime(2000,1,1), "Length": 0}]
    known_ips = ['local']
    total_length_2 = 0
    with open(file, 'r') as csvfile:
        reader = csv.DictReader(csvfile)
        
        for row in reader:
            packet = format_packet(row, session)
            total_length_2 += packet["Length"]

            # Add old packets to the formatted ones
            for p in last_packets:
                if p['Time'] + delta < packet['Time']:
                    formatted_packets.append(p)
            # Remove old packets from last_packet
            last_packets = [p for p in last_packets if p['Time'] + delta >= packet['Time']]
            
            found_older = False
            for previous_packet in last_packets:
                if (previous_packet['Sender'] == packet['Sender'] and
                        previous_packet['Receiver'] == packet['Receiver']):
                    previous_packet["Length"] += packet['Length']
                    previous_packet["Count"] += 1
                    #previous_packet["Paquet Ids"].append(packet["Paquet Id"])
                    found_older = True
                    break

            if not found_older:
                print(packet["Paquet Id"])
                last_packets.append(packet)
    
    # Add very last packets at the end
    for p in last_packets:
        formatted_packets.append(p)

    print(f'There are {len(formatted_packets)} packets aggregates')

    for p in formatted_packets:
        p['Time'] = p['Time'].isoformat()

    return formatted_packets
    


def get_domain(url):
    parsed_uri = urlparse(url)
    return(parsed_uri.netloc)

def get_ips(domain):
    res = subprocess.check_output(["dig","+short", domain])
    #res = subprocess.check_output(["host", "-t", "a", domain])
    res = res.decode("utf-8")
    res = res.split('\n')[:-1]
    res = [ip for ip in res if re.match(r"(?:[0-9]{1,3}\.){3}[0-9]{1,3}", ip)]
    return res

def get_location(ip):
    res = requests.get(url='http://extreme-ip-lookup.com/json/' + ip)
    data = res.json()
    #print(ip, data)
    if data['status'] == 'fail' or not data['lat']: 
        return None
    else:
        location = {'lat': data['lat'],
                    'long': data['lon'],
                    'country': data['country'],
                    'city': data['city'],
                    'businessName': data['businessName']}
        return location


def get_hostnames_from_ips(hostnames, file):

    with open(file, 'r') as f:
        data = json.load(f)

    for visit in data:
        domain = get_domain(visit['url'])
        ips = get_ips(domain)

        for ip in ips:
            if ip not in hostnames:
                hostnames[ip] = domain

    return hostnames

def get_location_for_packets(ips_from_packets_file, hostnames_from_history_file):
    with open(ips_from_packets_file, 'r') as f:
        data = json.load(f)

    with open(hostnames_from_history_file, 'r') as f:
        hostnames_from_history = json.load(f)

    ips = {}
    for packet in data:
        if packet['Sender'] != 'local':
            ip = packet['Sender']
            if ip not in ips:
                location = get_location(ip)
                if location and ip in hostnames_from_history:
                    location['domain'] = hostnames_from_history[ip]
                ips[ip] = location
        if packet['Receiver'] != 'local':
            ip = packet['Receiver']
            if ip not in ips:
                location = get_location(ip)
                if location and ip in hostnames_from_history:
                    location['domain'] = hostnames_from_history[ip]
                ips[ip] = location
    print(len(ips))
    return ips




if __name__ == "__main__":

    
    packets_files = [
        {'file': 'packets/leisure.csv', 'session': 'leisure'},
        {'file': 'packets/work.csv', 'session': 'work'}
    ]


    browsing_history_files = ['browsing_history.json']
    
    print('Formatting and aggregating packets...')
    packets = []
    for file in packets_files:
        filename = file['file']
        session = file['session']
        packets += format_packets(filename, session)

    with open('packets_data.json', 'w') as outfile:
        json.dump(packets, outfile, indent=4)


    print('Getting hostnames and ips from browsing history...')
    hostnames = {}
    for file in browsing_history_files:
        hostnames = get_hostnames_from_ips(hostnames, file)

    with open('hostnames_from_history.json', 'w') as outfile:
        json.dump(hostnames, outfile, indent=4)

    
    print('Getting IP location and domain...')
    with open('ips_from_packets.json', 'w') as outfile:
        json.dump(get_location_for_packets('packets_data.json', 'hostnames_from_history.json'), outfile, indent=4)








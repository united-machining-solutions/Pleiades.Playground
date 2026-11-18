using System.Globalization;
using System.Text;

namespace Pleiades.Playground.Ultimaker.Api;

// STL is a manufacturer format: coordinates are millimetres, not public SI values.
internal static class StlModel
{
    internal static byte[] Normalize(byte[] data)
    {
        var vertices = new List<(float X, float Y, float Z)>();
        if (data.Length >= 84 && 84L + 50L * BitConverter.ToUInt32(data, 80) == data.LongLength)
        {
            using var reader = new BinaryReader(new MemoryStream(data));
            reader.BaseStream.Position = 80;
            var count = reader.ReadUInt32();
            for (var triangle = 0U; triangle < count; triangle++)
            {
                reader.BaseStream.Position += 12;
                for (var i = 0; i < 3; i++) vertices.Add((reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle()));
                reader.ReadUInt16();
            }
        }
        else
        {
            using var reader = new StringReader(Encoding.ASCII.GetString(data));
            if (reader.ReadLine()?.TrimStart().StartsWith("solid", StringComparison.Ordinal) != true)
                throw new ArgumentException("Expected a binary or ASCII STL.");
            string? line;
            var facets = 0;
            var ends = 0;
            while ((line = reader.ReadLine()) is not null)
            {
                var parts = line.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length == 0) continue;
                if (parts[0] == "facet") facets++;
                if (parts[0] == "endfacet") ends++;
                if (parts[0] != "vertex") continue;
                if (parts.Length != 4 || !float.TryParse(parts[1], CultureInfo.InvariantCulture, out var x)
                    || !float.TryParse(parts[2], CultureInfo.InvariantCulture, out var y)
                    || !float.TryParse(parts[3], CultureInfo.InvariantCulture, out var z))
                    throw new ArgumentException("Invalid ASCII STL vertex.");
                vertices.Add((x, y, z));
            }
            if (facets != ends || vertices.Count != facets * 3) throw new ArgumentException("Incomplete STL facets.");
        }
        if (vertices.Count == 0 || vertices.Count % 3 != 0
            || vertices.Any(v => !float.IsFinite(v.X) || !float.IsFinite(v.Y) || !float.IsFinite(v.Z)))
            throw new ArgumentException("STL must contain complete triangles with finite coordinates.");
        var minX = vertices.Min(v => v.X); var maxX = vertices.Max(v => v.X);
        var minY = vertices.Min(v => v.Y); var maxY = vertices.Max(v => v.Y);
        var minZ = vertices.Min(v => v.Z); var maxZ = vertices.Max(v => v.Z);
        if (maxX - minX > 170 || maxY - minY > 190 || maxZ - minZ > 195
            || maxX <= minX || maxY <= minY || maxZ <= minZ)
            throw new ArgumentException("Model must have positive volume bounds and fit within 0.17 × 0.19 × 0.195 metre.");
        using var output = new MemoryStream();
        using var writer = new BinaryWriter(output);
        writer.Write(new byte[80]);
        writer.Write((uint)(vertices.Count / 3));
        for (var i = 0; i < vertices.Count; i += 3)
        {
            writer.Write(0F); writer.Write(0F); writer.Write(0F);
            for (var j = 0; j < 3; j++)
            {
                var v = vertices[i + j];
                // CuraEngine's CLI translates a centred STL to the machine's bed centre.
                writer.Write(v.X - minX - (maxX - minX) / 2);
                writer.Write(v.Y - minY - (maxY - minY) / 2);
                writer.Write(v.Z - minZ);
            }
            writer.Write((ushort)0);
        }
        return output.ToArray();
    }
}

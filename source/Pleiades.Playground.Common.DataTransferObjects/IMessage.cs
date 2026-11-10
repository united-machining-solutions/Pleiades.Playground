using System;

namespace Pleiades.Playground.Common.DataTransferObjects;

public interface IMessage
{
    DateTime Timestamp { get; set; }
}
